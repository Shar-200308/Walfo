import {Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-welcome-page',
  standalone: false,
  templateUrl: './welcome-page.component.html',
  styleUrl: './welcome-page.component.css'
})
export class WelcomePageComponent implements OnInit {
  nickName = '';

  ngOnInit() {
    //@ts-ignore
    let name = JSON.parse(localStorage.getItem('nickname'));
    this.nickName = name
  }
}
