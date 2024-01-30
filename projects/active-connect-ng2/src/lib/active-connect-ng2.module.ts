import { NgModule } from '@angular/core';
import { NgxIndexedDBModule, DBConfig } from 'ngx-indexed-db';

const dbConfig: DBConfig = {
  name: 'activeconnect_cache',
  version: 2,
  objectStoresMeta: [
    {
      store: 'outbound',
      storeConfig: { keyPath: 'method', autoIncrement: false },
      storeSchema: [
        { name: 'method', keypath: 'method', options: { unique: true } },
        { name: 'data', keypath: 'data', options: { unique: false } },
        {
          name: 'specificHash',
          keypath: 'specificHash',
          options: { unique: false },
        },
        {
          name: 'length',
          keypath: 'length',
          options: { unique: false },
        },
      ],
    },
  ],
};

@NgModule({
  declarations: [],
  imports: [NgxIndexedDBModule.forRoot(dbConfig)],
  exports: [NgxIndexedDBModule],
})
export class ActiveConnectNg2Module {}
