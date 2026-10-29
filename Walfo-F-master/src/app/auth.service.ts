import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UserDetailsService } from './user-details.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService implements CanActivate {

  constructor(public router: Router, private user: UserDetailsService) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    if (!this.user.isLoggedIn()) {
      this.router.navigate(['/login']);
      return of(false);
    }

    return this.user.validateToken().pipe(
      map((response: any) => {
        if (response && response.status) {
          return true;
        }
        this.user.removeToken();
        this.router.navigate(['/login']);
        return false;
      }),
      catchError(err => {
        this.user.removeToken();
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
