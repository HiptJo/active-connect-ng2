import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActiveConnectNg2Component } from './active-connect-ng2.component';

describe('ActiveConnectNg2Component', () => {
  let component: ActiveConnectNg2Component;
  let fixture: ComponentFixture<ActiveConnectNg2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ActiveConnectNg2Component ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActiveConnectNg2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
