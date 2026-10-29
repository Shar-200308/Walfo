import {Component, OnInit, ViewChild} from '@angular/core';
import {WebService} from '../web.service';
import {DialogComponent} from '../dialog/dialog.component';

@Component({
  selector: 'app-mydocument-page',
  standalone: false,
  templateUrl: './mydocument-page.component.html',
  styleUrl: './mydocument-page.component.css'
})
export class MydocumentPageComponent implements OnInit {

  public documentsData: any[] = [];

  show = false;
  noData = false;

  @ViewChild('Dialog') dialog: DialogComponent | any;

  constructor(private web: WebService) {

  }

  getData(){
    this.web.getDocuments().subscribe((response: any) => {
      const res = response;
      if(res.status){
        this.documentsData = res.data;
        if(this.documentsData.length > 0){
          this.noData = false
          this.show = true;
        }
        else {
          this.show = false;
          this.noData = true;
        }
      }
    });
  }

  openDialog(data: any){
    this.dialog.showDialog = true;
    this.dialog.dialogData = data;
    this.dialog.parent_component = this;
  }

  getURL(source: any){
    return this.web.serverIp+source
  }

  ngOnInit() {
    this.getData();
  }

  isImage(fileUrl: string): boolean{
    const  ext = fileUrl.split('.').pop()?.toLowerCase();
    return ['jpg','jpeg','png', 'gif'].includes(ext || '');
  }


}
