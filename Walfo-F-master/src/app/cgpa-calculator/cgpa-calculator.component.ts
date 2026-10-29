import { Component } from '@angular/core';

@Component({
  selector: 'app-cgpa-calculator',
  standalone: false,
  templateUrl: './cgpa-calculator.component.html',
  styleUrl: './cgpa-calculator.component.css'
})
export class CgpaCalculatorComponent {
  subjects: { name: string; marks: number | null }[] = [];
  cgpa: number | null = null;

  addSubject() {
    this.subjects.push({ name: '', marks: null });
  }

  removeSubject(index: number) {
    this.subjects.splice(index, 1);
    this.calculateCGPA();
  }

  getGradePoint(marks: number): number {
    if (marks >= 90) return 10;
    if (marks >= 80) return 9;
    if (marks >= 70) return 8;
    if (marks >= 60) return 7;
    if (marks >= 50) return 6;
    if (marks >= 45) return 5;
    if (marks >= 40) return 4;
    return 0;
  }

  calculateCGPA() {
    let totalPoints = 0;
    let count = 0;

    for (let sub of this.subjects) {
      if (sub.marks !== null) {
        totalPoints += this.getGradePoint(sub.marks);
        count++;
      }
    }

    this.cgpa = count > 0 ? totalPoints / count : null;
  }

}
