import {Component, ViewChild} from '@angular/core';
import {WebService} from '../web.service';
import {ToasterComponent} from '../toaster/toaster.component';
import {HttpClient} from '@angular/common/http';


@Component({
  selector: 'app-dialog',
  standalone: false,
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.css'
})
export class DialogComponent {
  showDialog  = false;

  public dialogData: any;
  public parent_component: any;
  @ViewChild('Toaster') toaster : ToasterComponent | any;
  constructor(private web: WebService, private http: HttpClient) {
  }

  closeDialog(){
    this.showDialog = false;
  }

  deleteDocument(){
    let document = JSON.parse(JSON.stringify(this.dialogData));
    this.web.deleteDocument(document.id).subscribe( response =>{
      let res = JSON.parse(JSON.stringify(response));
      console.log(res);
      if(res.status){
        this.toaster.title = 'Success';
        this.toaster.message = res.message;
        this.toaster.sIcon = true;
        this.toaster.isRed = false;
        this.toaster.showToaster();
        this.showDialog = false;
        if (this.parent_component && typeof this.parent_component.getData === 'function') {
          this.parent_component.getData();
        }
      }
      else {
        this.toaster.title = 'Error';
        this.toaster.message = res.message;
        this.toaster.sIcon = false;
        this.toaster.isRed = true;
        this.toaster.showToaster();
      }
    })
  }

  getURL(){
    return this.dialogData.document_url
  }

  isImage(fileUrl: string){
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    return ['jpg','jpeg','png','gif'].includes(ext || '');
  }

  downloadDocument() {
    // Step 1: Get the original file URL
    let fileUrl = this.getURL();

    // Step 2: Modify the URL to include fl_attachment to force download
    fileUrl = fileUrl.replace('/upload/', '/upload/fl_attachment/');

    // Step 3: Extract filename or use a fallback
    const fileName = this.dialogData.document.split('/').pop() || 'download';

    // Step 4: Make HTTP GET request to get file as blob
    this.http.get(fileUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      },
      error: () => {
        // Fallback: open original file directly so the user is never blocked
        window.open(this.getURL(), '_blank');
      }
    });
  }


}
