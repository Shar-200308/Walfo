import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {HomeComponent} from './home/home.component';
import {LoginPageComponent} from './login-page/login-page.component';
import {SignupPageComponent} from './signup-page/signup-page.component';
import {DashboardComponent} from './dashboard/dashboard.component';
import { MydocumentPageComponent } from './mydocument-page/mydocument-page.component';
import {UploadDocumentComponent} from './upload-document/upload-document.component';
import {PageComponent} from './page/page.component';
import {AuthService} from './auth.service';
import {CgpaCalculatorComponent} from './cgpa-calculator/cgpa-calculator.component';
import {ForgotPasswordComponent} from './forgot-password/forgot-password.component';



const routes: Routes = [
  {path: '', component: HomeComponent},
  {path: 'login', component: LoginPageComponent},
  {path: 'signup', component: SignupPageComponent},
  {path: 'forgot-password', component: ForgotPasswordComponent},
  {path: 'mydocuments', component:MydocumentPageComponent, canActivate: [AuthService]},
  {path: 'dashboard',component: DashboardComponent, canActivate: [AuthService]},
  {path: 'upload', component: UploadDocumentComponent, canActivate: [AuthService]},
  {path:'calculator', component: CgpaCalculatorComponent,canActivate: [AuthService]},
  {path:'**', redirectTo: ''}

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
