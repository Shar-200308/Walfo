import {Component, ViewChild} from '@angular/core';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import {WebService} from '../web.service';
import {ToasterComponent} from '../toaster/toaster.component';

@Component({
  selector: 'app-upload-document',
  standalone: false,
  templateUrl: './upload-document.component.html',
  styleUrl: './upload-document.component.css'
})
export class UploadDocumentComponent {
  public uploadForm : FormGroup | any;
  file: any;
  loader = false;
  @ViewChild('Toaster') toaster: ToasterComponent | any;

  constructor(private web: WebService) {
    this.uploadForm = new FormGroup({
      title : new FormControl('',[Validators.required]),
      document : new FormControl('',[Validators.required]),
    })
  }

  createDocument() {
    if(this.uploadForm.valid) {
      this.loader = true;
      let data = new FormData();
      if(this.file){
        data.append('document',this.file)
      }
      data.append('title',this.uploadForm.value.title)
      this.web.uploadDocument(data).subscribe(response =>{
        let res = JSON.parse(JSON.stringify(response));
        if(res.status){
          this.uploadForm.reset();
          this.file = null;
          this.toaster.title = 'Success';
          this.toaster.isRed = false;
          this.toaster.sIcon = true;
          this.toaster.message = res.message;
          this.toaster.showToaster();
          this.loader = false;
        }
        else {
          this.toaster.title = 'Error';
          this.toaster.isRed = true;
          this.toaster.sIcon = false;
          this.toaster.message = res.message;
          this.toaster.showToaster();
          this.loader = false;
        }
      }, error => {
        this.loader = false;
        this.toaster.title = 'Error';
        this.toaster.isRed = true;
        this.toaster.sIcon = false;
        this.toaster.message = error?.error?.message || 'Upload failed. Please try again.';
        this.toaster.showToaster();
      })
    }else {
      this.uploadForm.markAllAsTouched();
    }
  }

  getFile(event:any){
    this.file = event.target.files[0];
  }
}
