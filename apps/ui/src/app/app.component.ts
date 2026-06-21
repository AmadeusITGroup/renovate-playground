import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'renovate-playground-root',
  templateUrl: './app.component.html',
  styles: [
    `:host {
      display: block;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .app-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .app-content {
      flex: 1;
      padding: var(--df-spacing-5);
      max-width: 1600px;
      width: 100%;
      margin: 0 auto;
    }`,
  ],
})
export class AppComponent {
  title = 'renovate-playground';
}
