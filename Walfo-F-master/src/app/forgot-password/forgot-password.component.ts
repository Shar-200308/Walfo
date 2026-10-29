import { Component, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { WebService } from '../web.service';
import { ToasterComponent } from '../toaster/toaster.component';

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css'
})
export class ForgotPasswordComponent {

  // Steps: 'email' → 'reset'
  step: 'email' | 'reset' = 'email';

  emailForm: FormGroup | any;
  resetForm: FormGroup | any;

  loader = false;
  showPassword = false;
  showConfirm = false;
  sentEmail = '';

  @ViewChild('toaster') toaster: ToasterComponent | any;

  constructor(public router: Router, private web: WebService) {
    this.emailForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email])
    });

    this.resetForm = new FormGroup({
      otp1: new FormControl('', [Validators.required]),
      otp2: new FormControl('', [Validators.required]),
      otp3: new FormControl('', [Validators.required]),
      otp4: new FormControl('', [Validators.required]),
      new_password: new FormControl('', [Validators.required, Validators.minLength(6)]),
      confirm_password: new FormControl('', [Validators.required])
    });
  }

  sendOtp() {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.loader = true;
    const data = { email: this.emailForm.value.email };
    this.web.forgotPassword(data).subscribe((response: any) => {
      const res = JSON.parse(JSON.stringify(response));
      this.loader = false;
      if (res.status) {
        this.sentEmail = this.emailForm.value.email;
        this.step = 'reset';
        this.toaster.title = 'OTP Sent';
        this.toaster.message = res.message;
        this.toaster.sIcon = true;
        this.toaster.isRed = false;
        this.toaster.showToaster();
      } else {
        this.toaster.title = 'Error';
        this.toaster.message = res.message;
        this.toaster.sIcon = false;
        this.toaster.isRed = true;
        this.toaster.showToaster();
      }
    }, (error: any) => {
      this.loader = false;
      this.toaster.title = 'Error';
      this.toaster.message = error?.error?.message || 'Something went wrong. Please try again.';
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
    });
  }

  resetPassword() {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    const { otp1, otp2, otp3, otp4, new_password, confirm_password } = this.resetForm.value;
    if (new_password !== confirm_password) {
      this.toaster.title = 'Error';
      this.toaster.message = 'Passwords do not match';
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
      return;
    }
    this.loader = true;
    const data = {
      email: this.sentEmail,
      otp: `${otp1}${otp2}${otp3}${otp4}`,
      new_password
    };
    this.web.resetPassword(data).subscribe((response: any) => {
      const res = JSON.parse(JSON.stringify(response));
      this.loader = false;
      if (res.status) {
        this.toaster.title = 'Success';
        this.toaster.message = res.message;
        this.toaster.sIcon = true;
        this.toaster.isRed = false;
        this.toaster.showToaster();
        setTimeout(() => this.router.navigate(['/login']), 2000);
      } else {
        this.toaster.title = 'Error';
        this.toaster.message = res.message;
        this.toaster.sIcon = false;
        this.toaster.isRed = true;
        this.toaster.showToaster();
      }
    }, () => {
      this.loader = false;
      this.toaster.title = 'Error';
      this.toaster.message = 'Something went wrong. Please try again.';
      this.toaster.sIcon = false;
      this.toaster.isRed = true;
      this.toaster.showToaster();
    });
  }

  // OTP navigation helpers — template passes native HTMLInputElement directly
  onInput(event: any, current: any, next?: any) {
    const val = (current.value || '').replace(/[^0-9]/g, '');
    current.value = val;
    if (val && next) next.focus();
  }

  onKeyDown(event: KeyboardEvent, current: any, prev?: any) {
    if (event.key === 'Backspace' && !current.value && prev) {
      prev.focus();
      event.preventDefault();
    }
  }
}
