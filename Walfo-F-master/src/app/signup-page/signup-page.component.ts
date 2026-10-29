import {Component, ElementRef, ViewChild, OnInit, OnDestroy} from '@angular/core';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {WebService} from '../web.service';
import {ToasterComponent} from '../toaster/toaster.component';

declare var faceapi: any;

@Component({
  selector: 'app-signup-page',
  standalone: false,
  templateUrl: './signup-page.component.html',
  styleUrl: './signup-page.component.css'
})
export class SignupPageComponent implements OnInit, OnDestroy {
  public signupForm: FormGroup | any;
  Signup = true;
  Otp = false;
  public otpForm : FormGroup | any;
  welcome = false;
  loader = false;
  verifyingOtp = false;
  showPassword = false;

  loadingModels = true;
  faceStatusMessage = 'Initializing camera...';
  faceDetected = false;
  isCameraActive = false;
  faceDescriptor: number[] | null = null;
  faceImageBase64: string | null = null;

  @ViewChild('webcamVideo') webcamVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('webcamCanvas') webcamCanvas!: ElementRef<HTMLCanvasElement>;
  private stream: MediaStream | null = null;
  private faceDetectionInterval: any;
  private playHandler: (() => void) | null = null;

  @ViewChild('Toaster') toaster : ToasterComponent | any;

  constructor(public router: Router, private web: WebService) {
    this.signupForm = new FormGroup({
      name : new FormControl('', [Validators.required]),
      email : new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    });
    this.otpForm = new FormGroup({
      otp1: new FormControl('', [Validators.required]),
      otp2: new FormControl('', [Validators.required]),
      otp3: new FormControl('', [Validators.required]),
      otp4: new FormControl('', [Validators.required]),
    })
  }

  async ngOnInit() {
    // Automatically load face detection models and start camera on page open
    await this.loadModels();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async loadModels() {
    this.loadingModels = true;
    this.faceStatusMessage = 'Loading face detection models...';
    try {
      // Use vladmandic CDN — must match the @vladmandic/face-api library in index.html
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
      this.loadingModels = false;
      this.faceStatusMessage = 'Models loaded. Starting camera...';
      this.startCamera();
    } catch (err) {
      console.error('Error loading face-api models:', err);
      this.loadingModels = false;  // reset so user can retry
      this.faceStatusMessage = 'Failed to load models. Refresh or check connection.';
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });
      // setTimeout gives Angular time to render the *ngIf video element before assigning srcObject
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
      if (!faceapi?.nets?.ssdMobilenetv1?.isLoaded) {
        this.loadModels();
      } else {
        this.startCamera();
      }
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

      let isDetecting = false;

      this.faceDetectionInterval = setInterval(async () => {
        if (isDetecting || !this.isCameraActive || video.paused || video.ended) return;

        isDetecting = true;
        try {
          const detection = await faceapi.detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);

          if (detection) {
            this.faceDetected = true;
            this.faceStatusMessage = 'Face detected! Ready to signup.';

            const resizedDetections = faceapi.resizeResults(detection, displaySize);
            faceapi.draw.drawDetections(canvas, resizedDetections);

            this.faceDescriptor = Array.from(detection.descriptor);
            this.captureBase64Frame(video);
          } else {
            this.faceDetected = false;
            this.faceDescriptor = null;
            this.faceImageBase64 = null;
            this.faceStatusMessage = 'Looking for face... Please align your face in camera view.';
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

  doSignup() {
    if(this.signupForm.valid) {
      this.loader = true;
      // Lazily load models and start camera on first signup attempt
      // loadingModels starts as true (initial state), so we only skip if camera is already active
      if (!this.isCameraActive) {
        this.loadModels();
      }
      if (!this.faceDetected || !this.faceDescriptor) {
        this.loader = false;
        this.toaster.title = 'Error';
        this.toaster.message = 'Please ensure your face is clearly detected in the webcam view.';
        this.toaster.isRed = true;
        this.toaster.sIcon = false;
        this.toaster.showToaster();
        return;
      }
      const formData = this.signupForm.value;
      this.web.createUser(formData).subscribe((response: any) => {
        const res = response;
        if(res.status){
          this.toaster.title = 'Success';
          this.toaster.message = res.message;
          this.toaster.isRed = false;
          this.toaster.sIcon = true;
          this.toaster.showToaster();
          this.Signup = false;
          this.Otp = true;
          this.loader = false;
        }else{
          this.toaster.title = 'Error';
          this.toaster.message = res.message;
          this.toaster.isRed = true;
          this.toaster.sIcon = false;
          this.toaster.showToaster();
          this.loader = false;
        }
      })
    }
    else {
      this.signupForm.markAllAsTouched();
    }
  }

  verifyOtp(){
    if (this.verifyingOtp) return;  // prevent double submission
    this.verifyingOtp = true;
    let otp = this.otpForm.value.otp1+this.otpForm.value.otp2+this.otpForm.value.otp3+this.otpForm.value.otp4;
    let data = {
      'name': this.signupForm.value.name,
      'email': this.signupForm.value.email,
      'password': this.signupForm.value.password,
      'otp': otp,
      'face_descriptor': this.faceDescriptor,
      'face_image': this.faceImageBase64
    }
    this.web.verifyOtp(data).subscribe((response: any) => {
      const res = response;
      if(res.status){
        this.verifyingOtp = false;
        this.stopCamera();
        this.toaster.title = 'Success';
        this.toaster.message = res.message;
        this.toaster.isRed = false;
        this.toaster.sIcon = true;
        this.toaster.showToaster();
        localStorage.setItem('studentToken',res.token)
        localStorage.setItem('nickname', this.signupForm.value.name)
        localStorage.setItem('user_id', res.user_id)
        setTimeout(()=>{
          this.welcome = true;
        },1000);
        setTimeout(()=>{
          this.welcome = false;
          this.router.navigate(['/dashboard']);
        },3000)
      }else {
        this.verifyingOtp = false;
        this.toaster.title = 'Error';
        this.toaster.message = res.message;
        this.toaster.isRed = true;
        this.toaster.sIcon = false;
        this.toaster.showToaster();
      }
    })
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
