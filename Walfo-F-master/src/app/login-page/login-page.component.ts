import { Component, ElementRef, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { WebService } from '../web.service';
import { ToasterComponent } from '../toaster/toaster.component';

declare var faceapi: any;

// Eye landmark indices (68-point model)
const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];
const NOSE_TIP = 30; // nose tip landmark index

@Component({
  selector: 'app-login-page',
  standalone: false,
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css'
})
export class LoginPageComponent implements OnInit, OnDestroy {
  public loginForm: FormGroup | any;
  public otpForm: FormGroup | any;
  Otp = false;
  login = true;
  FaceScan = false;
  loader = false;
  verifyingOtp = false;
  showPassword = false;

  loadingModels = true;
  modelsLoaded = false;
  faceStatusMessage = 'Initializing camera...';
  faceDetected = false;
  isCameraActive = false;
  faceDescriptor: number[] | null = null;
  faceImageBase64: string | null = null;
  bestFrontalDescriptor: number[] | null = null;
  bestFrontalImage: string | null = null;
  failedAttempts = 0;
  readonly maxAttempts = 3;
  readonly FACE_MATCH_THRESHOLD = 0.60;
  backupOtp: string | null = null;

  // ── Liveness state ────────────────────────────────────────────────────
  livenessVerified = false;           // final gate: all checks passed
  alignConfirmed = false;           // step 1: aligned facing straight
  headTurnConfirmed = false;           // step 2: directional head turn/tilt confirmed
  targetDirection: 'LEFT' | 'RIGHT' | 'UP' = 'LEFT'; // target prompt direction

  livenessStep: 'align' | 'turn' | 'done' = 'align';
  livenessMessage = '👤 Please align your face in camera view';

  // Tracking data
  private boxCenterHistory: { x: number; y: number; time: number }[] = [];
  private earHistory: number[] = [];
  private baselineNoseRatioX: number | null = null;
  private baselineNoseRatioY: number | null = null;
  private maxEyeAsymmetry = 0;
  private shakeDetected = false;

  // Security & movement thresholds
  private readonly TURN_RATIO_DELTA = 0.08;   // relative horizontal nose ratio shift required
  private readonly TILT_UP_RATIO_DELTA = 0.05;   // relative vertical nose ratio shift required for UP tilt
  private readonly ASYMMETRY_THRESHOLD = 0.018;  // 3D eye compression threshold
  private readonly SHAKE_DISPLACEMENT_LIMIT = 35;     // max frame-to-frame center jump (px) for true phone shake

  // Spoof-alert throttle – only fire once per session
  private spoofAlertSent = false;
  // ────────────────────────────────────────────────────────────────────────────

  @ViewChild('webcamVideo') webcamVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('webcamCanvas') webcamCanvas!: ElementRef<HTMLCanvasElement>;
  private stream: MediaStream | null = null;
  private faceDetectionInterval: any;
  private playHandler: (() => void) | null = null;

  @ViewChild('toaster') toaster: ToasterComponent | any;

  constructor(public router: Router, private web: WebService) {
    this.loginForm = new FormGroup({
      email: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    });
    this.otpForm = new FormGroup({
      otp1: new FormControl('', [Validators.required]),
      otp2: new FormControl('', [Validators.required]),
      otp3: new FormControl('', [Validators.required]),
      otp4: new FormControl('', [Validators.required]),
    });
  }

  ngOnInit() {
    // Preload face-api models in background so face detection starts instantly
    this.loadModels(false).catch(err => console.warn('Background model preload error:', err));
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async initFaceScan() {
    this.login = false;
    this.FaceScan = true;
    this.resetLiveness();
    if (this.modelsLoaded) {
      this.loadingModels = false;
      this.startCamera();
    } else {
      await this.loadModels(true);
    }
  }

  // ── Liveness helpers ─────────────────────────────────────────────────────────

  private resetLiveness() {
    this.livenessVerified = false;
    this.alignConfirmed = false;
    this.headTurnConfirmed = false;
    this.bestFrontalDescriptor = null;
    this.bestFrontalImage = null;
    const directions: ('LEFT' | 'RIGHT' | 'UP')[] = ['LEFT', 'RIGHT', 'UP'];
    this.targetDirection = directions[Math.floor(Math.random() * directions.length)];
    this.livenessStep = 'align';
    this.livenessMessage = '👤 Please look straight at the camera to align';
    this.boxCenterHistory = [];
    this.earHistory = [];
    this.baselineNoseRatioX = null;
    this.baselineNoseRatioY = null;
    this.maxEyeAsymmetry = 0;
    this.shakeDetected = false;
    this.spoofAlertSent = false;
    this.mismatchBlocked = false;
  }

  /** Eye Aspect Ratio (EAR) for one eye given 6 landmark points */
  private computeEAR(pts: { x: number; y: number }[]): number {
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    const A = dist(pts[1], pts[5]);
    const B = dist(pts[2], pts[4]);
    const C = dist(pts[0], pts[3]);
    return (A + B) / (2.0 * C);
  }

  private getLandmarkPoints(landmarks: any, indices: number[]) {
    return indices.map(i => landmarks.positions[i]);
  }

  /**
   * Detects true rapid camera/phone shaking.
   * Ignores minor detector bounding box jitter and smooth head turns.
   */
  private detectPhoneShake(box: any): boolean {
    if (!box) return false;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const now = Date.now();

    this.boxCenterHistory.push({ x: cx, y: cy, time: now });
    if (this.boxCenterHistory.length > 8) {
      this.boxCenterHistory.shift();
    }

    if (this.boxCenterHistory.length < 5) return false;

    let totalDisplacement = 0;
    let rapidOscillations = 0;
    let prevDx = 0;

    for (let i = 1; i < this.boxCenterHistory.length; i++) {
      const dx = this.boxCenterHistory[i].x - this.boxCenterHistory[i - 1].x;
      const dy = this.boxCenterHistory[i].y - this.boxCenterHistory[i - 1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      totalDisplacement += dist;

      if (prevDx !== 0 && Math.sign(dx) !== Math.sign(prevDx) && Math.abs(dx) > 14) {
        rapidOscillations++;
      }
      if (Math.abs(dx) > 10) prevDx = dx;
    }

    const avgDisplacement = totalDisplacement / (this.boxCenterHistory.length - 1);

    if (avgDisplacement > this.SHAKE_DISPLACEMENT_LIMIT || rapidOscillations >= 3) {
      return true;
    }
    return false;
  }

  /**
   * Core liveness analysis supporting LEFT, RIGHT, and UP challenges.
   */
  private analyseLiveness(detection: any): void {
    if (this.livenessVerified) return;

    const landmarks = detection.landmarks;
    const positions = landmarks.positions;
    const box = detection.detection.box;

    if (this.detectPhoneShake(box)) {
      this.shakeDetected = true;
      this.livenessMessage = '🚫 High motion detected! Keep device steady & turn face slowly.';
      return;
    }

    const leftEyePts = this.getLandmarkPoints(landmarks, LEFT_EYE);
    const rightEyePts = this.getLandmarkPoints(landmarks, RIGHT_EYE);

    const leftEyeCenter = {
      x: leftEyePts.reduce((s, p) => s + p.x, 0) / 6,
      y: leftEyePts.reduce((s, p) => s + p.y, 0) / 6
    };
    const rightEyeCenter = {
      x: rightEyePts.reduce((s, p) => s + p.x, 0) / 6,
      y: rightEyePts.reduce((s, p) => s + p.y, 0) / 6
    };

    const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
    const eyeDist = Math.sqrt(
      (leftEyeCenter.x - rightEyeCenter.x) ** 2 + (leftEyeCenter.y - rightEyeCenter.y) ** 2
    );

    if (eyeDist === 0) return;

    // Relative Nose Ratios (X = horizontal turn, Y = vertical tilt)
    const relativeNoseRatioX = (positions[NOSE_TIP].x - eyeMidX) / eyeDist;
    const faceHeight = (positions[8].y - eyeMidY) || 1; // landmark 8 is chin
    const relativeNoseRatioY = (positions[NOSE_TIP].y - eyeMidY) / faceHeight;

    const leftEAR = this.computeEAR(leftEyePts);
    const rightEAR = this.computeEAR(rightEyePts);
    const avgEAR = (leftEAR + rightEAR) / 2;
    this.earHistory.push(avgEAR);
    if (this.earHistory.length > 30) this.earHistory.shift();

    const eyeAsymmetry = Math.abs(leftEAR - rightEAR);
    if (eyeAsymmetry > this.maxEyeAsymmetry) this.maxEyeAsymmetry = eyeAsymmetry;

    // ── Step 1: Align Face ──────────────────────────────────────────────────
    if (!this.alignConfirmed) {
      if (Math.abs(relativeNoseRatioX) < 0.12) {
        this.alignConfirmed = true;
        this.baselineNoseRatioX = relativeNoseRatioX;
        this.baselineNoseRatioY = relativeNoseRatioY;
        this.bestFrontalDescriptor = Array.from(detection.descriptor);
        this.bestFrontalImage = this.faceImageBase64;
        this.livenessStep = 'turn';
        const icon = this.targetDirection === 'LEFT' ? '👈' : (this.targetDirection === 'RIGHT' ? '👉' : '👆');
        const action = this.targetDirection === 'UP' ? 'tilt your head UP' : `turn your face to the ${this.targetDirection}`;
        this.livenessMessage = `${icon} Please slowly ${action}`;
      } else {
        this.livenessMessage = '👤 Please look straight at the camera to align';
      }
      return;
    }

    // ── Step 2: Directional Challenge (LEFT, RIGHT, or UP) ─────────────────
    if (!this.headTurnConfirmed && this.baselineNoseRatioX !== null && this.baselineNoseRatioY !== null) {
      const shiftX = relativeNoseRatioX - this.baselineNoseRatioX;
      const shiftY = relativeNoseRatioY - this.baselineNoseRatioY;
      const icon = this.targetDirection === 'LEFT' ? '👈' : (this.targetDirection === 'RIGHT' ? '👉' : '👆');

      let turnedEnough = false;
      let turnProgress = 0;

      if (this.targetDirection === 'UP') {
        // Tilting head UP moves nose tip upwards relative to eyes (shiftY is negative)
        const absShiftY = Math.abs(shiftY);
        turnedEnough = shiftY < -this.TILT_UP_RATIO_DELTA || absShiftY >= this.TILT_UP_RATIO_DELTA;
        turnProgress = Math.min(100, Math.round((absShiftY / this.TILT_UP_RATIO_DELTA) * 100));
      } else {
        // LEFT or RIGHT horizontal turn
        const absShiftX = Math.abs(shiftX);
        turnedEnough = absShiftX >= this.TURN_RATIO_DELTA;
        turnProgress = Math.min(100, Math.round((absShiftX / this.TURN_RATIO_DELTA) * 100));
      }

      if (turnedEnough) {
        // Motion confirmed — verify 3D depth / deformation
        this.headTurnConfirmed = true;
        this.livenessStep = 'done';
        this.livenessMessage = '✅ Face Verified! Click "Verify Face".';
        this.livenessVerified = true;
      } else {
        const actionLabel = this.targetDirection === 'UP' ? 'Tilt head UP' : `Turn face to ${this.targetDirection}`;
        this.livenessMessage = `${icon} ${actionLabel}… ${turnProgress}%`;
      }
    }
  }

  private isSpoofAttempt(): boolean {
    if (this.earHistory.length < 20) return false;
    const mean = this.earHistory.reduce((s, v) => s + v, 0) / this.earHistory.length;
    const variance = this.earHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / this.earHistory.length;
    return variance < 0.00003;
  }

  // ── Camera / model loading ──────────────────────────────────────────────────

  async loadModels(startCam: boolean = true) {
    if (this.modelsLoaded) {
      this.loadingModels = false;
      if (startCam) this.startCamera();
      return;
    }
    this.loadingModels = true;
    this.faceStatusMessage = 'Loading face detection models...';
    try {
      const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
      // Only fetch each model from CDN if it hasn't been loaded into memory yet
      if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
      }
      if (!faceapi.nets.faceLandmark68Net.isLoaded) {
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
      }
      if (!faceapi.nets.faceRecognitionNet.isLoaded) {
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
      }
      this.modelsLoaded = true;
      this.loadingModels = false;
      this.faceStatusMessage = 'Models loaded. Starting camera...';
      if (startCam) {
        this.startCamera();
      }
    } catch (err) {
      console.error('Error loading face-api models:', err);
      this.loadingModels = false;
      this.faceStatusMessage = 'Failed to load models. Refresh or check connection.';
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });
      setTimeout(() => {
        if (this.webcamVideo && this.webcamVideo.nativeElement) {
          this.webcamVideo.nativeElement.srcObject = this.stream;
          this.isCameraActive = true;
          this.startFaceDetection();
        }
      }, 100);
    } catch (err) {
      console.error('Error starting webcam:', err);
      this.faceStatusMessage = 'Camera access denied. Please grant permission.';
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.webcamVideo && this.webcamVideo.nativeElement) {
      if (this.playHandler) {
        this.webcamVideo.nativeElement.removeEventListener('play', this.playHandler);
        this.playHandler = null;
      }
      this.webcamVideo.nativeElement.srcObject = null;
    }
    this.isCameraActive = false;
    this.faceDetected = false;
    this.faceDescriptor = null;
    this.faceImageBase64 = null;
    this.faceStatusMessage = 'Camera is off.';
    if (this.faceDetectionInterval) {
      clearInterval(this.faceDetectionInterval);
      this.faceDetectionInterval = null;
    }
    const canvas = this.webcamCanvas?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  toggleCamera() {
    if (this.isCameraActive) {
      this.stopCamera();
    } else {
      this.resetLiveness();
      this.startCamera();
    }
  }

  registeredDescriptor: number[] | null = null;
  mismatchBlocked = false;

  cancelFaceScan() {
    this.stopCamera();
    this.FaceScan = false;
    this.login = true;
    this.mismatchBlocked = false;
    this.failedAttempts = 0;
  }

  doLogin() {
    if (this.loginForm.valid) {
      this.loader = true;
      const raw = this.loginForm.value;
      const formData = {
        email: (raw.email || '').trim().toLowerCase(),
        password: raw.password
      };
      this.web.verifyCredentials(formData).subscribe((response: any) => {
        const res = response;
        if (res.status) {
          this.loader = false;
          if (res.registered_descriptor) {
            this.registeredDescriptor = res.registered_descriptor;
          } else {
            this.registeredDescriptor = null;
          }
          this.initFaceScan();
        } else {
          this.toaster.title = 'Error';
          this.toaster.message = res.message;
          this.toaster.sIcon = false;
          this.toaster.isRed = true;
          this.toaster.showToaster();
          this.loader = false;
        }
      }, (error: any) => {
        this.toaster.title = 'Error';
        this.toaster.message = error?.error?.message || 'Incorrect email or password.';
        this.toaster.sIcon = false;
        this.toaster.isRed = true;
        this.toaster.showToaster();
        this.loader = false;
      });
    } else {
      this.loginForm.markAllAsTouched();
    }
  }

  startFaceDetection() {
    const video = this.webcamVideo.nativeElement;
    const canvas = this.webcamCanvas.nativeElement;

    if (this.playHandler) {
      video.removeEventListener('play', this.playHandler);
    }

    this.playHandler = () => {
      const displaySize = { width: video.videoWidth || 320, height: video.videoHeight || 240 };
      faceapi.matchDimensions(canvas, displaySize);

      if (this.faceDetectionInterval) {
        clearInterval(this.faceDetectionInterval);
      }

      let continuousFrames = 0;
      let isDetecting = false;
      let consecutiveMismatchFrames = 0;

      this.faceDetectionInterval = setInterval(async () => {
        if (isDetecting || !this.isCameraActive || video.paused || video.ended || this.mismatchBlocked) return;

        isDetecting = true;
        try {
          const detection = await faceapi
            .detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);

          if (detection) {
            this.faceDetected = true;
            continuousFrames++;

            const resizedDetections = faceapi.resizeResults(detection, displaySize);
            faceapi.draw.drawDetections(canvas, resizedDetections);

            this.faceDescriptor = Array.from(detection.descriptor);
            this.captureBase64Frame(video);

            // ── Step 1: Frontal Match Sanity Check ────────────────────────
            // Only check when looking straight forward (never during liveness head turns)
            if (this.registeredDescriptor && Array.isArray(this.registeredDescriptor)) {
              const landmarks = detection.landmarks;
              const positions = landmarks.positions;
              const leftEyePts = this.getLandmarkPoints(landmarks, LEFT_EYE);
              const rightEyePts = this.getLandmarkPoints(landmarks, RIGHT_EYE);
              const leftEyeCenter = { x: leftEyePts.reduce((s, p) => s + p.x, 0) / 6, y: leftEyePts.reduce((s, p) => s + p.y, 0) / 6 };
              const rightEyeCenter = { x: rightEyePts.reduce((s, p) => s + p.x, 0) / 6, y: rightEyePts.reduce((s, p) => s + p.y, 0) / 6 };
              const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
              const eyeDist = Math.sqrt((leftEyeCenter.x - rightEyeCenter.x) ** 2 + (leftEyeCenter.y - rightEyeCenter.y) ** 2) || 1;
              const relativeNoseRatioX = (positions[NOSE_TIP].x - eyeMidX) / eyeDist;

              // Only check matching when facing straight
              if (Math.abs(relativeNoseRatioX) < 0.15) {
                const dist = Math.sqrt(
                  this.registeredDescriptor.reduce((sum: number, val: number, idx: number) => sum + (val - this.faceDescriptor![idx]) ** 2, 0)
                );

                if (dist < this.FACE_MATCH_THRESHOLD) {
                  consecutiveMismatchFrames = 0;
                  this.bestFrontalDescriptor = [...this.faceDescriptor];
                  this.bestFrontalImage = this.faceImageBase64;
                } else {
                  consecutiveMismatchFrames++;
                  // Only lock down after 25 consecutive frontal frames (~5 seconds of looking straight with an intruder face)
                  if (consecutiveMismatchFrames >= 25) {
                    if (!this.spoofAlertSent) {
                      this.spoofAlertSent = true;
                      this.sendSpoofAlert('Unauthorized Access Attempt: Face mismatch detected! Someone is attempting to misuse your account');
                    }
                    this.mismatchBlocked = true;
                    this.livenessVerified = false;
                    this.stopCamera();
                    this.faceStatusMessage = '🚨 LOCKDOWN: Face mismatch! Someone is attempting to misuse your account. Alert email sent to owner.';
                    this.toaster.title = '🚨 Face Mismatch';
                    this.toaster.message = 'Face mismatch detected! An alert email with captured photo has been sent to the account owner.';
                    this.toaster.isRed = true;
                    this.toaster.sIcon = false;
                    this.toaster.showToaster();
                    return;
                  }
                }
              }
            }

            // ── Step 2: Run Directional Liveness ─────
            this.analyseLiveness(detection);

            if (!this.livenessVerified && continuousFrames >= 20 && this.isSpoofAttempt()) {
              if (!this.spoofAlertSent) {
                this.spoofAlertSent = true;
                this.sendSpoofAlert('Photo / flat-image spoof detected (near-zero EAR variance)');
              }
              this.faceStatusMessage = '🚫 Photo detected! Real 3D face required. Security alert sent to owner.';
            } else {
              this.faceStatusMessage = this.livenessMessage;
            }

          } else {
            this.faceDetected = false;
            this.faceDescriptor = null;
            this.faceImageBase64 = null;
            continuousFrames = 0;
            consecutiveMismatchFrames = 0;
            if (!this.livenessVerified && !this.mismatchBlocked) {
              this.faceStatusMessage = 'Looking for face... Please align your face in camera view.';
            }
          }
        } catch (err) {
          console.error('Face detection frame error:', err);
        } finally {
          isDetecting = false;
        }
      }, 200);
    };

    video.addEventListener('play', this.playHandler);
  }

  captureBase64Frame(video: HTMLVideoElement) {
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth || 320;
      tempCanvas.height = video.videoHeight || 240;
      const ctx = tempCanvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      this.faceImageBase64 = tempCanvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
      console.error('Error capturing base64 frame:', err);
    }
  }

  private sendSpoofAlert(reason: string) {
    const email = this.loginForm.value.email;
    if (!email) return;
    const payload = {
      email,
      captured_image: this.faceImageBase64 || '',
      attempt_type: reason
    };
    this.web.reportSpoofAttempt(payload).subscribe({
      next: () => console.warn('[Walfo Security] Security alert sent to account owner.'),
      error: (e: any) => console.error('[Walfo Security] Failed to send security alert:', e)
    });
  }

  verifyFace() {
    if (this.mismatchBlocked) {
      this.toaster.title = '🚨 Access Blocked';
      this.toaster.message = 'Verification is blocked due to face mismatch. Contact the account owner.';
      this.toaster.isRed = true;
      this.toaster.sIcon = false;
      this.toaster.showToaster();
      return;
    }
    // Block if liveness not yet confirmed and fire security alert
    if (!this.livenessVerified) {
      if (!this.spoofAlertSent) {
        this.spoofAlertSent = true;
        this.sendSpoofAlert('Attempted face verification without completing directional liveness challenge');
      }
      this.toaster.title = '⚠️ Liveness Required';
      this.toaster.message = 'Liveness check not passed. Complete the directional challenge first.';
      this.toaster.isRed = true;
      this.toaster.sIcon = false;
      this.toaster.showToaster();
      return;
    }
    if (!this.faceDetected || !this.faceDescriptor) {
      this.toaster.title = 'Error';
      this.toaster.message = 'Please ensure your face is clearly detected by the webcam.';
      this.toaster.isRed = true;
      this.toaster.sIcon = false;
      this.toaster.showToaster();
      return;
    }
    this.loader = true;
    let data = {
      email: this.loginForm.value.email,
      password: this.loginForm.value.password,
      face_descriptor: this.bestFrontalDescriptor || this.faceDescriptor,
      face_image: this.bestFrontalImage || this.faceImageBase64,
      liveness_confirmed: true   // signals backend that liveness challenge was completed
    };
    this.web.verifyFaceAndSendOtp(data).subscribe((response: any) => {
      const res = response;
      if (res.status) {
        this.failedAttempts = 0;
        this.backupOtp = res.otp || null;
        this.stopCamera();
        this.FaceScan = false;
        this.Otp = true;
        this.toaster.title = 'Success';
        this.toaster.message = res.message;
        this.toaster.sIcon = true;
        this.toaster.isRed = false;
        this.toaster.showToaster();
        this.loader = false;
      } else {
        this.handleVerificationFailure(res.message);
      }
    }, error => {
      this.handleVerificationFailure(error?.error?.message);
    });
  }

  private handleVerificationFailure(msg?: string) {
    this.loader = false;
    this.failedAttempts++;

    if (this.failedAttempts < this.maxAttempts) {
      this.livenessVerified = false;
      this.alignConfirmed = false;
      this.headTurnConfirmed = false;
      this.bestFrontalDescriptor = null;
      this.bestFrontalImage = null;
      this.resetLiveness();
      const remaining = this.maxAttempts - this.failedAttempts;
      this.faceStatusMessage = `⚠️ Face match failed. Please align and retry (${remaining} attempt${remaining > 1 ? 's' : ''} left).`;
      this.toaster.title = 'Face Mismatch';
      this.toaster.message = msg || `Face not recognized. You have ${remaining} attempt${remaining > 1 ? 's' : ''} left. Ensure good lighting and look straight.`;
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
    } else {
      this.mismatchBlocked = true;
      this.livenessVerified = false;
      this.stopCamera();
      this.faceStatusMessage = '🚨 LOCKDOWN: Face mismatch! Maximum attempts exceeded. Security alert sent to owner.';
      this.toaster.title = '🚨 Face Mismatch';
      this.toaster.message = msg || 'Maximum face verification attempts exceeded. Access blocked & security alert sent.';
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
    }
  }

  verifyOtp() {
    if (this.verifyingOtp) return;
    if (this.otpForm.valid) {
      this.verifyingOtp = true;
      let otp = this.otpForm.value.otp1 + this.otpForm.value.otp2 + this.otpForm.value.otp3 + this.otpForm.value.otp4;
      let data = {
        email: this.loginForm.value.email,
        otp
      };
      this.web.loginVerify(data).subscribe((response: any) => {
        const res = response;
        if (res.status) {
          this.verifyingOtp = false;
          localStorage.setItem('studentToken', res.token);
          this.router.navigate(['/dashboard']);
        } else {
          this.verifyingOtp = false;
          this.toaster.title = 'Error';
          this.toaster.message = res.message;
          this.toaster.sIcon = false;
          this.toaster.isRed = true;
          this.toaster.showToaster();
        }
      });
    }
  }

  @ViewChild('otp1', { static: false }) otp1!: ElementRef<HTMLInputElement>;
  @ViewChild('otp2', { static: false }) otp2!: ElementRef<HTMLInputElement>;
  @ViewChild('otp3', { static: false }) otp3!: ElementRef<HTMLInputElement>;
  @ViewChild('otp4', { static: false }) otp4!: ElementRef<HTMLInputElement>;

  onInput(event: any, current: HTMLInputElement, next?: HTMLInputElement) {
    const inputValue = current.value;
    const numericValue = inputValue.replace(/[^0-9]/g, '');
    current.value = numericValue;
    if (numericValue && next) {
      next.focus();
    }
    if (event.inputType === 'deleteContentBackward') {
      const previous = this.getPreviousInput(current);
      if (previous) {
        previous.focus();
      }
    }
  }

  onKeyDown(event: KeyboardEvent, current: HTMLInputElement, previous?: HTMLInputElement) {
    if (event.key === 'Backspace' && !current.value && previous) {
      previous.focus();
      event.preventDefault();
    }
  }

  getPreviousInput(current: HTMLInputElement): HTMLInputElement | null {
    switch (current) {
      case this.otp4.nativeElement: return this.otp3.nativeElement;
      case this.otp3.nativeElement: return this.otp2.nativeElement;
      case this.otp2.nativeElement: return this.otp1.nativeElement;
      default: return null;
    }
  }
}
