import { Component } from '@angular/core';

@Component({
  selector: 'app-toaster',
  standalone: false,
  templateUrl: './toaster.component.html',
  styleUrl: './toaster.component.css'
})
export class ToasterComponent {
  toaster = false;
  sIcon = true;
  isRed = false;

  title = '';
  message = '';
  //@ts-ignore
  toasterTimeout : ReturnType<typeof setTimeout>;

  showToaster(){
    if(this.toaster){
      clearTimeout(this.toasterTimeout);
      this.toasterTimeout = setTimeout(()=>{
        this.toaster = false;
      }, 4000)
      return;
    }
    this.toaster = true;
    this.toasterTimeout = setTimeout(()=>{
      this.toaster = false;
    }, 4000)
  }

  close(){
    this.toaster = false;
  }

}
