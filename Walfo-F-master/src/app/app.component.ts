import {Component, OnInit} from '@angular/core';
import {UserDetailsService} from './user-details.service';
import {ActivatedRoute, NavigationEnd, Router} from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Walfo-F';
  showHeader = true;
  showNavbar = false;

  constructor(private router: Router) {

  }


  ngOnInit() {
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationEnd) {
        const currentUrl = event.urlAfterRedirects;

        const isLoginPage = currentUrl === '/login';
        const isSignupPage = currentUrl === '/signup';
        const isHomePage = currentUrl === '/' || currentUrl === '';
        const isLoggedIn = !!localStorage.getItem('studentToken');

        this.showHeader = isLoginPage || isHomePage || !isLoggedIn || isSignupPage;
        this.showNavbar = !this.showHeader && isLoggedIn;
      }
    })
  }




}
