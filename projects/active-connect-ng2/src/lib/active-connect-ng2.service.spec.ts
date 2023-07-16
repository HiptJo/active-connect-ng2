import { TestBed } from '@angular/core/testing';

import { ActiveConnectNg2Service } from './active-connect-ng2.service';

describe('ActiveConnectNg2Service', () => {
  let service: ActiveConnectNg2Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActiveConnectNg2Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
