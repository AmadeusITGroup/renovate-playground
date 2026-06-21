import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styles: [`
    .rp-navbar {
      background: var(--df-color-primary-intense-background);
      border-bottom: 1px solid var(--df-color-primary-main-default-border);
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .rp-navbar-inner {
      max-width: 1600px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--df-spacing-4) var(--df-spacing-6);
    }
    .rp-brand {
      display: flex;
      align-items: center;
      gap: var(--df-spacing-3);
      text-decoration: none;
      color: var(--df-color-inert-neutral-alt-foreground);
    }
    .rp-brand-icon {
      font-size: var(--df-icons-sizing-2xlarge);
      color: var(--df-theme-primary-40);
    }
    .rp-brand-text {
      font-size: var(--df-typo-sizing-3xlarge);
      font-weight: var(--df-typo-weight-bold);
      letter-spacing: var(--df-typo-letterSpacing-condensed);
      color: var(--df-color-inert-neutral-alt-foreground);
    }
    .rp-nav-links {
      display: flex;
      align-items: center;
      gap: var(--df-spacing-1);
    }
    .rp-nav-link {
      display: flex;
      align-items: center;
      gap: var(--df-spacing-2);
      padding: var(--df-spacing-2) var(--df-spacing-4);
      border-radius: var(--df-borderRadius-main-small);
      color: var(--df-theme-primary-20);
      text-decoration: none;
      font-size: var(--df-typo-sizing-small);
      font-weight: var(--df-typo-weight-medium);
      transition: all 0.2s ease;

      &:hover:not(.disabled) {
        color: var(--df-color-inert-neutral-alt-foreground);
        background: var(--df-color-primary-main-default-border);
      }
      &.active {
        color: var(--df-color-inert-neutral-alt-foreground);
        background: var(--df-color-primary-main-default-background);
      }
      &.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }
      i {
        font-size: var(--df-icons-sizing-small);
      }
    }
  `]
})
export class NavbarComponent {}

