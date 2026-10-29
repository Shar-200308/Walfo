import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebService {

  serverIp = environment.apiUrl;

  constructor(private http: HttpClient) {

  }

  createUser(data: any) {
    return this.http.post(this.serverIp + 'user/create',data)
  }

  verifyOtp(data: any) {
    return this.http.post(this.serverIp + 'user/verify-otp',data)
  }

  loginUser(data: any) {
    return this.http.post(this.serverIp + 'user/login',data)
  }

  loginVerify(data: any) {
    return this.http.post(this.serverIp + 'user/login-verify',data)
  }

  verifyCredentials(data: any) {
    return this.http.post(this.serverIp + 'user/verify-credentials', data)
  }

  verifyFaceAndSendOtp(data: any) {
    return this.http.post(this.serverIp + 'user/verify-face-otp', data)
  }

  getDocuments(page: number = 1, pageSize: number = 20){
    let token = localStorage.getItem('studentToken');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `token ${token}`
    });
    return this.http.get(
      `${this.serverIp}user/get-documents?page=${page}&page_size=${pageSize}`,
      { headers }
    );
  }

  uploadDocument(data: any) {
    let token = localStorage.getItem('studentToken');
    let headers = new HttpHeaders({
        'Authorization': `token ${token}`
    }
    )
    return this.http.post(this.serverIp + 'user/upload-document',data, { headers })
  }

  deleteDocument(data: any) {
    let token = localStorage.getItem('studentToken');
    let headers = new HttpHeaders({
      'Authorization': `token ${token}`
    })
    return this.http.delete(this.serverIp + 'user/delete-document/'+ data, { headers })
  }

  validateToken() {
    let token = localStorage.getItem('studentToken');
    const headers = new HttpHeaders({
      'Authorization': `token ${token}`
    });
    return this.http.get(this.serverIp + 'user/validate-token', { headers });
  }

  forgotPassword(data: any) {
    return this.http.post(this.serverIp + 'user/forgot-password', data);
  }

  resetPassword(data: any) {
    return this.http.post(this.serverIp + 'user/reset-password', data);
  }

  updateFace(data: any) {
    let token = localStorage.getItem('studentToken');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `token ${token}`
    });
    return this.http.post(this.serverIp + 'user/update-face', data, { headers });
  }

  reportSpoofAttempt(data: any) {
    return this.http.post(this.serverIp + 'user/report-spoof', data);
  }

}
