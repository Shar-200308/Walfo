import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { LoginPageComponent } from './login-page/login-page.component';
import { HeaderComponent } from './header/header.component';
import { SignupPageComponent } from './signup-page/signup-page.component';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { ToasterComponent } from './toaster/toaster.component';
import {HttpClientModule} from "@angular/common/http";
import { WelcomePageComponent } from './welcome-page/welcome-page.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { NavbarComponent } from './navbar/navbar.component';
import { MydocumentPageComponent } from './mydocument-page/mydocument-page.component';
import { UploadDocumentComponent } from './upload-document/upload-document.component';
import { PageComponent } from './page/page.component';
import { DialogComponent } from './dialog/dialog.component';
import {IMAGE_CONFIG} from '@angular/common';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { CgpaCalculatorComponent } from './cgpa-calculator/cgpa-calculator.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';


@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    LoginPageComponent,
    HeaderComponent,
    SignupPageComponent,
    ToasterComponent,
    WelcomePageComponent,
    DashboardComponent,
    NavbarComponent,
    MydocumentPageComponent,
    UploadDocumentComponent,
    PageComponent,
    DialogComponent,
    CgpaCalculatorComponent,
    ForgotPasswordComponent

  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    HttpClientModule,
    FormsModule,
    PdfViewerModule
  ],
  providers: [
    {
      provide: IMAGE_CONFIG,
      useValue: {
        disableImageSizeWarning: true,
        disableImageLazyLoadWarning: true,
      }
    }

  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
