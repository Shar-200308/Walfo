import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MydocumentPageComponent } from './mydocument-page.component';

describe('MydocumentPageComponent', () => {
  let component: MydocumentPageComponent;
  let fixture: ComponentFixture<MydocumentPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MydocumentPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MydocumentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
