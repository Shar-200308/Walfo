import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {UserDetailsService} from '../user-details.service';

@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {

  isMenuOpen = false;
  showMenu = false;
  showLogoutConfirm = false;

  constructor(public router: Router, private user: UserDetailsService) {
  }

  openMenu(){
    this.isMenuOpen = !this.isMenuOpen;
    this.showMenu = !this.showMenu;
  }

  doLogout(){
    this.showLogoutConfirm = true;
  }

  confirmLogout(){
    this.showLogoutConfirm = false;
    this.user.removeToken();
    if (this.showMenu) this.openMenu();
    this.router.navigate(['/login']);
  }

  cancelLogout(){
    this.showLogoutConfirm = false;
  }

  protected readonly open = open;
}
