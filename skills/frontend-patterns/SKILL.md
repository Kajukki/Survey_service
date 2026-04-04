---
name: angular-modern
description: >
  Expert guidance for building modern Angular applications (v17+) using best practices: signals-based reactivity, httpResource API, standalone components, new control flow syntax, inject() function, and the official Angular style guide. Use this skill whenever the user wants to build, scaffold, refactor, or review Angular code — including components, services, directives, pipes, routing, state management, forms, or HTTP calls. Trigger on any mention of Angular, ng generate, NgRx Signals, RxJS interop with signals, or Angular CLI tasks. Always prefer this skill over generic TypeScript guidance when Angular is involved.
---

# Modern Angular Development Skill

This skill covers Angular v17+ best practices. Always produce idiomatic, modern Angular code. When in doubt, prefer the newer API over the legacy equivalent.

---

## Quick Reference: New vs. Legacy

| Concern | ❌ Legacy | ✅ Modern |
|---|---|---|
| Reactivity | `BehaviorSubject` + `async` pipe | `signal()`, `computed()`, `effect()` |
| HTTP + state | `HttpClient` + manual loading flags | `httpResource()` |
| Modules | `NgModule` | Standalone components |
| Control flow | `*ngIf`, `*ngFor`, `*ngSwitch` | `@if`, `@for`, `@switch` |
| DI | Constructor injection | `inject()` function |
| Output events | `@Output() EventEmitter` | `output()` function |
| Input binding | `@Input()` decorator | `input()` / `input.required()` |
| Two-way binding | `@Input()` + `@Output()` pair | `model()` signal |
| Lazy loading | `loadChildren` with module | `loadComponent` / `loadChildren` with routes |
| Change detection | `Default` / `OnPush` manual | `OnPush` + signals (automatic) |

---

## 1. Signals — Core Reactivity

### Writable Signals
```typescript
import { signal, computed, effect } from '@angular/core';

// Writable signal
const count = signal(0);

// Read: count()
// Write: count.set(1), count.update(v => v + 1), count.mutate(arr => arr.push(x))

// Computed (memoized, lazy, read-only)
const doubled = computed(() => count() * 2);

// Effect (runs when deps change; use sparingly — prefer computed or templates)
effect(() => {
  console.log('count changed:', count());
});
```

### Signal Inputs / Outputs (preferred over decorators)
```typescript
import { Component, input, output, model } from '@angular/core';

@Component({ ... })
export class MyComponent {
  // Required input
  title = input.required<string>();

  // Optional input with default
  disabled = input(false);

  // Two-way bindable model signal
  value = model<string>('');

  // Typed output (replaces EventEmitter)
  selected = output<string>();

  onSelect(item: string) {
    this.selected.emit(item);
  }
}
```

### RxJS Interop
Use `toSignal` / `toObservable` when bridging RxJS and signals:
```typescript
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

// Observable → Signal (auto-subscribes, cleans up with component)
const data = toSignal(this.http.get<Data[]>('/api/data'), { initialValue: [] });

// Signal → Observable (for operators like debounceTime)
const search$ = toObservable(this.searchQuery);
const results = toSignal(search$.pipe(debounceTime(300), switchMap(...)));
```

---

## 2. `httpResource` API

Use `httpResource` for declarative, signal-based HTTP requests. It replaces the pattern of `HttpClient` + manual `isLoading` / `error` signals in most cases.

### Basic Usage
```typescript
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';

interface User { id: number; name: string; }

@Component({
  selector: 'app-users',
  template: `
    @if (users.isLoading()) { <p>Loading…</p> }
    @else if (users.error()) { <p>Error: {{ users.error() }}</p> }
    @else {
      @for (user of users.value(); track user.id) {
        <li>{{ user.name }}</li>
      }
    }
  `
})
export class UsersComponent {
  users = httpResource<User[]>('/api/users');
}
```

### Dynamic URL (reactive to signals)
```typescript
export class UserDetailComponent {
  userId = input.required<number>();

  // Re-fetches automatically when userId() changes
  user = httpResource<User>(() => `/api/users/${this.userId()}`);
}
```

### With Options (method, body, headers)
```typescript
const result = httpResource<ApiResponse>(() => ({
  url: '/api/search',
  method: 'POST',
  body: { query: this.query() },
  headers: { 'X-Custom': 'value' },
}));
```

### Available Resource Properties
```typescript
resource.value()      // T | undefined — the response data
resource.isLoading()  // boolean
resource.error()      // unknown — any fetch/parse error
resource.status()     // 'idle' | 'loading' | 'resolved' | 'error'
resource.reload()     // () => void — manually trigger reload
```

### When NOT to use `httpResource`
- Fire-and-forget mutations (POST/PUT/DELETE with no response needed) → use `HttpClient` directly.
- Complex retry/polling logic → use `HttpClient` + RxJS operators.
- Streaming responses → use `HttpClient` with `observe: 'events'`.

---

## 3. Standalone Components (always use)

Never generate `NgModule` for new code. All components, directives, and pipes should be `standalone: true`.

```typescript
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MyPipe } from './my.pipe';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MyPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {}
```

Bootstrap with `bootstrapApplication`:
```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
  ]
});
```

---

## 4. New Control Flow Syntax (`@if`, `@for`, `@switch`)

**Always use** built-in control flow. Never use `*ngIf`, `*ngFor`, `*ngSwitch`.

```html
<!-- @if / @else if / @else -->
@if (user()) {
  <p>Welcome, {{ user()!.name }}</p>
} @else if (isGuest()) {
  <p>Hello, Guest</p>
} @else {
  <p>Loading…</p>
}

<!-- @for with required track -->
@for (item of items(); track item.id) {
  <li>{{ item.name }}</li>
} @empty {
  <li>No items found.</li>
}

<!-- @switch -->
@switch (status()) {
  @case ('loading') { <spinner /> }
  @case ('error')   { <error-banner /> }
  @default          { <content /> }
}
```

---

## 5. Dependency Injection with `inject()`

Use `inject()` instead of constructor injection everywhere.

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UserService } from './user.service';

@Component({ ... })
export class ProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    // ...
  }
}
```

`inject()` also works in standalone functions, making utility factory functions much cleaner:
```typescript
export function injectCurrentUser() {
  const authService = inject(AuthService);
  return toSignal(authService.currentUser$);
}
```

---

## 6. Services

Services are `@Injectable({ providedIn: 'root' })` by default (tree-shakeable singleton). Use signals for state.

```typescript
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = signal<CartItem[]>([]);

  // Public read-only view
  readonly items = this._items.asReadonly();
  readonly total = computed(() =>
    this._items().reduce((sum, i) => sum + i.price * i.qty, 0)
  );

  add(item: CartItem) {
    this._items.update(items => [...items, item]);
  }

  remove(id: number) {
    this._items.update(items => items.filter(i => i.id !== id));
  }
}
```

---

## 7. Routing

Use functional route guards and resolvers. Lazy-load with `loadComponent`.

```typescript
// app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];

// guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
```

---

## 8. Deferrable Views (`@defer`)

Use `@defer` for lazy-loading heavy components:

```html
@defer (on viewport) {
  <heavy-chart [data]="chartData()" />
} @placeholder {
  <div class="chart-skeleton" />
} @loading (minimum 500ms) {
  <spinner />
} @error {
  <p>Failed to load chart.</p>
}
```

Trigger conditions: `on idle`, `on viewport`, `on hover`, `on interaction`, `on timer(2s)`, `when condition`.

---

## 9. Reactive Forms with Signals

Use typed `FormGroup`/`FormControl`. Bridge to signals with `toSignal`:

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form (ngSubmit)="onSubmit()">
      <input [formControl]="form.controls.email" />
      @if (form.controls.email.invalid && form.controls.email.touched) {
        <span>Valid email required.</span>
      }
      <button type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `
})
export class LoginFormComponent {
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.minLength(8)],
  });

  // Expose form value as signal for use in template or computed
  formValue = toSignal(this.form.valueChanges);

  onSubmit() {
    if (this.form.valid) { /* submit */ }
  }
}
```

---

## 10. Change Detection Strategy

Always use `OnPush`. With signals, change detection is automatic within `OnPush`.

```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  ...
})
```

---

## 11. Style Guide Essentials

Follow the [official Angular Style Guide](https://angular.dev/style-guide). Key rules:

### Naming
- Files: `feature-name.component.ts`, `user.service.ts`, `auth.guard.ts`
- Selectors: `app-` prefix for app components, `lib-` for library components
- Classes: `UserProfileComponent`, `AuthService`, `AdminGuard`

### File Structure (one concept per file)
```
src/app/
├── core/              # Singleton services, guards, interceptors
│   ├── auth/
│   └── http/
├── shared/            # Shared standalone components, pipes, directives
├── features/          # Feature folders (lazy-loaded)
│   └── users/
│       ├── user-list/
│       │   ├── user-list.component.ts
│       │   └── user-list.component.html
│       └── users.routes.ts
└── app.routes.ts
```

### Component Rules
- Keep templates < 50 lines — extract sub-components aggressively
- Keep components "dumb" where possible; push logic to services or computed signals
- Use `trackBy` equivalent (`track item.id`) in all `@for` loops
- Never put business logic in lifecycle hooks — prefer `effect()` or `computed()`

### Signals Rules
- Expose state as `readonly` signals from services: `_state = signal(x)` → `state = _state.asReadonly()`
- Avoid `effect()` for derived state — use `computed()` instead
- Avoid writing to signals inside `computed()` — it will throw

---

## 12. Common Patterns

### Pagination with `httpResource`
```typescript
export class ListComponent {
  page = signal(1);

  items = httpResource<PaginatedResult>(() => ({
    url: '/api/items',
    params: { page: this.page(), limit: 20 },
  }));

  nextPage() { this.page.update(p => p + 1); }
  prevPage() { this.page.update(p => Math.max(1, p - 1)); }
}
```

### Optimistic Updates
```typescript
add(item: Item) {
  // Optimistically update UI
  this._items.update(items => [...items, item]);

  this.http.post<Item>('/api/items', item).subscribe({
    error: () => {
      // Rollback on error
      this._items.update(items => items.filter(i => i !== item));
    }
  });
}
```

### Route Param → Signal
```typescript
export class DetailComponent {
  private route = inject(ActivatedRoute);

  // Convert route param to signal
  id = toSignal(this.route.paramMap.pipe(map(p => p.get('id')!)));

  // Reactive fetch driven by route param
  detail = httpResource<Detail>(() => `/api/items/${this.id()}`);
}
```

---

## CLI Cheat Sheet

```bash
# Generate standalone component
ng g c features/users/user-list --standalone

# Generate service
ng g s core/auth/auth

# Generate functional guard
ng g guard core/auth/auth --functional

# Generate pipe
ng g pipe shared/pipes/truncate --standalone

# Build for production
ng build --configuration production
```

---

## Checklist Before Submitting Angular Code

- [ ] Standalone components with `imports: []` (no NgModule)
- [ ] `httpResource()` for data fetching (not manual loading state)
- [ ] `input()` / `output()` / `model()` (not `@Input` / `@Output` decorators)
- [ ] `inject()` for DI (not constructor injection)
- [ ] `@if` / `@for` / `@switch` (not `*ngIf` / `*ngFor`)
- [ ] `track item.id` in every `@for`
- [ ] `ChangeDetectionStrategy.OnPush` on every component
- [ ] `signal()` / `computed()` for state (not `BehaviorSubject` + `async` pipe)
- [ ] Services expose state as `asReadonly()` signals
- [ ] Lazy-loaded routes with `loadComponent`
- [ ] File and class names follow Angular style guide conventions
