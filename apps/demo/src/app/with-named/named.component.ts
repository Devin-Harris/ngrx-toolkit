import { Component, signal, inject, untracked, effect, computed } from '@angular/core';
import {
  getState,
  patchState,
  signalStore,
  signalStoreFeature,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { JsonPipe } from '@angular/common';
import { withNamed } from '@angular-architects/ngrx-toolkit';
import { FormsModule } from '@angular/forms';
import { MatInput, MatInputModule } from '@angular/material/input';

const withCommonFeature = () =>
  signalStoreFeature(
    withState(() => ({ commonField: 'test' })),
    withComputed((store) => ({
      commonFieldComputed: computed(
        () => `${store.commonField()} - computed`
      ),
    })),
    withMethods((store) => ({
      setField: (value: string) => {
        patchState(store, { commonField: value });
      },
    })),
  );

const SomeStore = signalStore(
  { providedIn: 'root' },
  withCommonFeature(),
  withNamed('second', withCommonFeature),
  withNamed('third', withCommonFeature),
  withHooks((store) => ({
    onInit() {
      store.setField('Hello');
      store.secondSetField('World');
      store.thirdSetField('!');
    }
  }))
);

@Component({
  template: `
    <h2>
      <pre>withNamed</pre>
    </h2>

    <div class="sections">
      <div class="section">
        Store State:
        <pre>{{ state() | json }}</pre>

        Store Computations:
        <pre>{{props() | json}}</pre>
      </div>
      
      <div class="section">
        <mat-form-field>
          <mat-label>commonField</mat-label>
          <input matInput [value]="store.commonField()" (input)="onCommonFieldInput($event)" />
        </mat-form-field>
      </div>
      
      <div class="section">
        <mat-form-field>
          <mat-label>secondCommonField</mat-label>
          <input matInput [value]="store.secondCommonField()" (input)="onSecondCommonFieldInput($event)" />
        </mat-form-field>
      </div>
      
      <div class="section">
        <mat-form-field>
          <mat-label>thirdCommonField</mat-label>
          <input matInput [value]="store.thirdCommonField()" (input)="onThirdCommonFieldInput($event)" />
        </mat-form-field>
      </div>
    </div>
  `,
  styles: [`
    .sections {
      display: flex;
      flex-direction: column;
      gap: 2em;
      .section {
      }
    }
    `],
  imports: [
    JsonPipe,
    FormsModule,
    MatInputModule
  ],
})
export class NamedSettingComponent {
  readonly store = inject(SomeStore);
  readonly state = computed(() => getState(this.store))
  readonly props = computed(() => ({
    commonFieldComputed: this.store.commonFieldComputed(),
    secondCommonFieldComputed: this.store.secondCommonFieldComputed(),
    thirdCommonFieldComputed: this.store.thirdCommonFieldComputed(),
  }))

  onCommonFieldInput(event: Event) {
    this.store.setField((event.target as HTMLInputElement).value)
  }
  onSecondCommonFieldInput(event: Event) {
    this.store.secondSetField((event.target as HTMLInputElement).value)
  }
  onThirdCommonFieldInput(event: Event) {
    this.store.thirdSetField((event.target as HTMLInputElement).value)
  }
}
