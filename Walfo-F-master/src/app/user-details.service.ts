import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserDetailsService {

  constructor(private http: HttpClient) {}

  setToken(token: any) {
    localStorage.setItem('studentToken', token);
  }

  getToken() {
    return localStorage.getItem('studentToken');
  }

  removeToken() {
    localStorage.removeItem('studentToken');
    localStorage.removeItem('nickname');
    localStorage.removeItem('user_id');
  }

  isLoggedIn(): boolean {
    return localStorage.getItem('studentToken') != null;
  }

  validateToken(): Observable<any> {
    const token = localStorage.getItem('studentToken');
    const headers = new HttpHeaders({
      'Authorization': `Token ${token}`
    });
    return this.http.get(environment.apiUrl + 'user/validate-token', { headers });
  }
}
