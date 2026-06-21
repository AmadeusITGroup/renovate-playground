import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  standalone: false,
  selector: 'renovate-playground-home',
  templateUrl: './home.component.html',
  styles: [
    `
      .rp-home {
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--df-spacing-7) var(--df-spacing-6) var(--df-spacing-8);
      }
      .rp-hero {
        text-align: center;
        padding: var(--df-spacing-6) 0 var(--df-spacing-7);
      }
      .rp-hero-title {
        font-size: var(--df-typo-sizing-6xlarge);
        font-weight: var(--df-typo-weight-bold);
        line-height: 1.15;
        letter-spacing: var(--df-typo-letterSpacing-condensed);
        color: var(--df-color-inert-neutral-main-foreground);
        margin: 0 0 var(--df-spacing-5);
      }
      .rp-gradient {
        color: var(--df-color-primary-main-default-background);
      }
      .rp-hero-subtitle {
        font-size: var(--df-typo-sizing-large);
        line-height: 1.65;
        color: var(--df-theme-neutral-80);
        max-width: 620px;
        margin: 0 auto var(--df-spacing-7);
      }
      .rp-features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--df-spacing-5);
        margin-top: var(--df-spacing-4);
      }
      .rp-feature-card {
        background: var(--df-color-inert-neutral-main-background);
        border: 1px solid var(--df-color-inert-neutral-main-border);
        border-radius: var(--df-borderRadius-main-large);
        padding: var(--df-spacing-6);
        transition: all 0.2s ease;
        position: relative;
        cursor: pointer;

        &:not(.rp-feature-card--disabled):hover {
          border-color: var(--df-color-primary-main-default-border);
          box-shadow: 0 4px 24px var(--df-color-shadow-1);
          transform: translateY(-2px);
        }
      }
      .rp-feature-card--disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .rp-feature-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--df-borderRadius-main-small);
        font-size: var(--df-icons-sizing-2xlarge);
        margin-bottom: var(--df-spacing-4);
      }
      .rp-feature-icon--primary {
        background: var(--df-color-primary-subtle-background);
        color: var(--df-color-primary-main-default-background);
      }
      .rp-feature-icon--accent {
        background: var(--df-color-accent-subtle-background);
        color: var(--df-color-accent-main-default-background);
      }
      .rp-feature-card h3 {
        font-size: var(--df-typo-sizing-large);
        font-weight: var(--df-typo-weight-bold);
        color: var(--df-color-inert-neutral-main-foreground);
        margin: 0 0 var(--df-spacing-2);
      }
      .rp-feature-card p {
        font-size: var(--df-typo-sizing-small);
        line-height: 1.55;
        color: var(--df-theme-neutral-80);
        margin: 0;
      }
      .rp-soon-badge {
        display: inline-block;
        margin-top: var(--df-spacing-3);
        font-size: var(--df-typo-sizing-xsmall);
        font-weight: var(--df-typo-weight-bold);
        text-transform: uppercase;
        letter-spacing: var(--df-typo-letterSpacing-spaced);
        color: var(--df-color-warning-main-default-foreground);
        background: var(--df-color-warning-main-default-background);
        padding: var(--df-spacing-1) var(--df-spacing-3);
        border-radius: var(--df-borderRadius-main-rounded);
      }
    `,
  ],
})
export class HomeComponent {
  constructor(private router: Router) {}

  navigateToPlayground(): void {
    this.router.navigate(['/playground']);
  }
}
