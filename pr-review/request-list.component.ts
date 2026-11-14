import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-request-list',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, FormsModule],
  template: `
    <div class="toolbar">
      <input #search (keyup)="onSearch(search.value)" placeholder="Search..." />
      <select [(ngModel)]="status" (change)="load()">
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="blocked">Blocked</option>
        <option value="resolved">Resolved</option>
      </select>
    </div>

    <div *ngIf="loading" class="spinner">Loading...</div>

    <table>
      <tr *ngFor="let r of requests" [ngClass]="getRowClass(r)" (click)="open(r)">
        <td>{{ r.id }}</td>
        <td [innerHTML]="highlight(r.title)"></td>
        <td>{{ getAssigneeName(r.assigneeId) }}</td>
        <td>{{ r.priority }}</td>
        <td>{{ isOverdue(r) ? 'OVERDUE' : '' }}</td>
      </tr>
    </table>
  `,
})
export class RequestListComponent implements OnInit {
  requests: any[] = [];
  users: any[] = [];
  status = '';
  term = '';
  loading = false;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.http.get('http://localhost:3001/api/users').subscribe((users: any) => {
      this.users = users;
      this.load();
    });

    setInterval(() => {
      this.load();
    }, 10000);
  }

  onSearch(term: string) {
    this.term = term;
    this.load();
  }

  load() {
    this.loading = true;
    this.http
      .get(`http://localhost:3001/api/requests?q=${this.term}&status=${this.status}&pageSize=1000`)
      .subscribe((res: any) => {
        this.requests = res.items;
        this.requests.sort((a, b) => (a.priority > b.priority ? -1 : 1));
        this.loading = false;
      });
  }

  highlight(text: string) {
    return this.sanitizer.bypassSecurityTrustHtml(
      text.replace(this.term, `<mark>${this.term}</mark>`)
    );
  }

  getAssigneeName(id: string) {
    return this.users.find((u) => u.id == id).name;
  }

  isOverdue(r: any) {
    return new Date(r.slaDueAt) < new Date();
  }

  getRowClass(r: any) {
    console.log('row class', r.id);
    return { critical: r.priority == 'critical', overdue: this.isOverdue(r) };
  }

  open(r: any) {
    window.location.href = '/requests/' + r.id;
  }
}
