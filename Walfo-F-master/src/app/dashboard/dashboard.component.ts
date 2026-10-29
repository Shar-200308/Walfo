import {Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {WebService} from '../web.service';
import {DialogComponent} from '../dialog/dialog.component';
import {ToasterComponent} from '../toaster/toaster.component';

declare var faceapi: any;

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {

  public count = 0;
  show = false;
  noData = false;

  // User profile
  userName = '';
  userEmail = '';
  userId = '';
  faceImage: string | null = null;

  // Face update camera
  showFaceCamera = false;
  loadingModels = false;
  isCameraActive = false;
  faceDetected = false;
  faceStatusMessage = 'Initializing...';
  faceDescriptor: number[] | null = null;
  faceImageBase64: string | null = null;
  savingFace = false;
  private stream: MediaStream | null = null;
  private faceDetectionInterval: any;
  private playHandler: (() => void) | null = null;

  public documentsData: any[] = [];
  totalDocuments = 0;
  currentPage = 1;
  readonly PAGE_SIZE = 20;

  @ViewChild('Dialog') dialog: DialogComponent | any;
  @ViewChild('toaster') toaster: ToasterComponent | any;
  @ViewChild('webcamVideo') webcamVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('webcamCanvas') webcamCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(private web: WebService) {
    this.getData();
    this.getUserProfile();
  }

  getUserProfile() {
    this.web.validateToken().subscribe((response: any) => {
      const res = response;
      if (res.status) {
        this.userName  = res.name  || localStorage.getItem('nickname') || '';
        this.userEmail = res.user  || '';
        this.userId    = res.user_id || localStorage.getItem('user_id') || '';
        this.faceImage = res.face_image || null;
      }
    });
  }

  getData(page: number = 1) {
    this.web.getDocuments(page, this.PAGE_SIZE).subscribe((response: any) => {
      const res = response;
      if (res.status) {
        this.documentsData = res.data;   // already ordered by server (-uploaded_at)
        this.totalDocuments = res.total ?? res.data.length;
        this.currentPage = res.page ?? 1;
        this.show = this.documentsData.length > 0;
        this.noData = this.documentsData.length === 0;
        this.count = this.documentsData.length;
      }
    });
  }

  getURL(source: any) {
    return this.web.serverIp + source;
  }

  ngOnInit() {}

  ngOnDestroy() {
    this.stopCamera();
  }

  isImage(fileUrl: string): boolean {
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '');
  }

  delete(data: any) {
    this.dialog.showDialog = true;
    this.dialog.dialogData = data;
    this.dialog.parent_component = this;
  }

  // ── Face Camera ─────────────────────────────────────────────────────────────

  async openFaceCamera() {
    this.showFaceCamera = true;
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
      await this.startCamera();
    } catch (err) {
      this.loadingModels = false;  // reset so user can retry
      this.faceStatusMessage = 'Failed to load models. Check internet connection.';
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });
      // Wait one tick for *ngIf to render the video element
      setTimeout(() => {
        if (this.webcamVideo && this.webcamVideo.nativeElement) {
          this.webcamVideo.nativeElement.srcObject = this.stream;
          this.isCameraActive = true;
          this.startFaceDetection();
        }
      }, 100);
    } catch (err) {
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
    if (this.faceDetectionInterval) {
      clearInterval(this.faceDetectionInterval);
      this.faceDetectionInterval = null;
    }
  }

  closeFaceCamera() {
    this.stopCamera();
    this.showFaceCamera = false;
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
      if (this.faceDetectionInterval) clearInterval(this.faceDetectionInterval);
      this.faceDetectionInterval = setInterval(async () => {
        if (!this.isCameraActive || video.paused || video.ended) return;
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        if (detection) {
          this.faceDetected = true;
          this.faceStatusMessage = 'Face detected! Click "Save Face Photo".';
          this.faceDescriptor = Array.from(detection.descriptor);
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = video.videoWidth || 320;
          tempCanvas.height = video.videoHeight || 240;
          tempCanvas.getContext('2d')?.drawImage(video, 0, 0);
          this.faceImageBase64 = tempCanvas.toDataURL('image/jpeg', 0.85);
          faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection, displaySize));
        } else {
          this.faceDetected = false;
          this.faceDescriptor = null;
          this.faceImageBase64 = null;
          this.faceStatusMessage = 'No face detected. Align your face to camera.';
        }
      }, 300);
    };

    video.addEventListener('play', this.playHandler);
  }

  saveFace() {
    if (!this.faceDescriptor || !this.faceImageBase64) return;
    this.savingFace = true;
    const data = { face_descriptor: this.faceDescriptor, face_image: this.faceImageBase64 };
    this.web.updateFace(data).subscribe((response: any) => {
      const res = response;
      this.savingFace = false;
      if (res.status) {
        this.faceImage = res.face_image;
        this.closeFaceCamera();
        this.toaster.title = 'Success';
        this.toaster.message = 'Face photo saved! It now shows on your profile.';
        this.toaster.sIcon = true;
        this.toaster.isRed = false;
        this.toaster.showToaster();
      } else {
        this.toaster.title = 'Error';
        this.toaster.message = res.message;
        this.toaster.sIcon = false;
        this.toaster.isRed = true;
        this.toaster.showToaster();
      }
    }, () => {
      this.savingFace = false;
      this.toaster.title = 'Error';
      this.toaster.message = 'Failed to save face. Try again.';
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
    });
  }

  protected readonly length = length;
}
