import { Component } from '@angular/core';

@Component({
  selector: 'app-page',
  standalone: false,
  templateUrl: './page.component.html',
  styleUrl: './page.component.css'
})
export class PageComponent {

  upload = false;
  dashboard = true;

  currentPage = 'dashboard';

  onPageChange(page: string) {
    console.log('🟡 doNavigate called with:', page);
    this.currentPage = page;
  }

  pageNavigation(page: string) {
    console.log('🟢 Received page nav for:', page);
    if (page === 'dashboard') {
      this.dashboard = true;
      this.upload = false;
    } else if (page === 'upload') {
      this.dashboard = false;
      this.upload = true;
    }
  }




}
