/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {LocationChangeEvent, LocationChangeListener, PlatformLocation} from '@angular/common';
import {Inject, Injectable, InjectionToken, Optional} from '@angular/core';
import {Subject} from 'rxjs';

/**
 * Parser from https://tools.ietf.org/html/rfc3986#appendix-B
 * ^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?
 *  12            3  4          5       6  7        8 9
 *
 * Example: http://www.ics.uci.edu/pub/ietf/uri/#Related
 *
 * Results in:
 *
 * $1 = http:
 * $2 = http
 * $3 = //www.ics.uci.edu
 * $4 = www.ics.uci.edu
 * $5 = /pub/ietf/uri/
 * $6 = <undefined>
 * $7 = <undefined>
 * $8 = #Related
 * $9 = Related
 */
const urlParse = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

function parseUrl(urlStr: string, baseHref: string) {
  const verifyProtocol = /^((http[s]?|ftp):\/\/)/;
  let serverBase: string|undefined;

  // URL class requires full URL. If the URL string doesn't start with protocol, we need to add
  // an arbitrary base URL which can be removed afterward.
  if (!verifyProtocol.test(urlStr)) {
    serverBase = 'http://empty.com/';
  }
  let parsedUrl: {
    protocol: string,
    hostname: string,
    port: string,
    pathname: string,
    search: string,
    hash: string
  };
  try {
    parsedUrl = new URL(urlStr, serverBase);
  } catch (e) {
    const result = urlParse.exec(serverBase || '' + urlStr);
    if (!result) {
      throw new Error(`Invalid URL: ${urlStr} with base: ${baseHref}`);
    }
    const hostSplit = result[4].split(':');
    parsedUrl = {
      protocol: result[1],
      hostname: hostSplit[0],
      port: hostSplit[1] || '',
      pathname: result[5],
      search: result[6],
      hash: result[8],
    };
  }
  if (parsedUrl.pathname && parsedUrl.pathname.indexOf(baseHref) === 0) {
    parsedUrl.pathname = parsedUrl.pathname.substring(baseHref.length);
  }
  return {
    hostname: !serverBase && parsedUrl.hostname || '',
    protocol: !serverBase && parsedUrl.protocol || '',
    port: !serverBase && parsedUrl.port || '',
    pathname: parsedUrl.pathname || '/',
    search: parsedUrl.search || '',
    hash: parsedUrl.hash || '',
  };
}

/**
 * Mock platform location config
 *
 * 模拟平台的 location 配置
 *
 * @publicApi
 */
export interface MockPlatformLocationConfig {
  startUrl?: string;
  appBaseHref?: string;
}

/**
 * Provider for mock platform location config
 *
 * 模拟平台 location 配置的提供者
 *
 * @publicApi
 */
export const MOCK_PLATFORM_LOCATION_CONFIG =
    new InjectionToken<MockPlatformLocationConfig>('MOCK_PLATFORM_LOCATION_CONFIG');

/**
 * Mock implementation of URL state.
 *
 * URL 状态的模拟实现。
 *
 * @publicApi
 */
@Injectable()
export class MockPlatformLocation implements PlatformLocation {
  private baseHref: string = '';
  private hashUpdate = new Subject<LocationChangeEvent>();
  private urlChangeIndex: number = 0;
  private urlChanges: {
    hostname: string,
    protocol: string,
    port: string,
    pathname: string,
    search: string,
    hash: string,
    state: unknown
  }[] = [{hostname: '', protocol: '', port: '', pathname: '/', search: '', hash: '', state: null}];

  constructor(@Inject(MOCK_PLATFORM_LOCATION_CONFIG) @Optional() config?:
                  MockPlatformLocationConfig) {
    if (config) {
      this.baseHref = config.appBaseHref || '';

      const parsedChanges =
          this.parseChanges(null, config.startUrl || 'http://_empty_/', this.baseHref);
      this.urlChanges[0] = {...parsedChanges};
    }
  }

  get hostname() {
    return this.urlChanges[this.urlChangeIndex].hostname;
  }
  get protocol() {
    return this.urlChanges[this.urlChangeIndex].protocol;
  }
  get port() {
    return this.urlChanges[this.urlChangeIndex].port;
  }
  get pathname() {
    return this.urlChanges[this.urlChangeIndex].pathname;
  }
  get search() {
    return this.urlChanges[this.urlChangeIndex].search;
  }
  get hash() {
    return this.urlChanges[this.urlChangeIndex].hash;
  }
  get state() {
    return this.urlChanges[this.urlChangeIndex].state;
  }


  getBaseHrefFromDOM(): string {
    return this.baseHref;
  }

  onPopState(fn: LocationChangeListener): VoidFunction {
    // No-op: a state stack is not implemented, so
    // no events will ever come.
    return () => {};
  }

  onHashChange(fn: LocationChangeListener): VoidFunction {
    const subscription = this.hashUpdate.subscribe(fn);
    return () => subscription.unsubscribe();
  }

  get href(): string {
    let url = `${this.protocol}//${this.hostname}${this.port ? ':' + this.port : ''}`;
    url += `${this.pathname === '/' ? '' : this.pathname}${this.search}${this.hash}`;
    return url;
  }

  get url(): string {
    return `${this.pathname}${this.search}${this.hash}`;
  }

  private parseChanges(state: unknown, url: string, baseHref: string = '') {
    // When the `history.state` value is stored, it is always copied.
    state = JSON.parse(JSON.stringify(state));
    return {...parseUrl(url, baseHref), state};
  }

  replaceState(state: any, title: string, newUrl: string): void {
    const {pathname, search, state: parsedState, hash} = this.parseChanges(state, newUrl);

    this.urlChanges[this.urlChangeIndex] =
        {...this.urlChanges[this.urlChangeIndex], pathname, search, hash, state: parsedState};
  }

  pushState(state: any, title: string, newUrl: string): void {
    const {pathname, search, state: parsedState, hash} = this.parseChanges(state, newUrl);
    if (this.urlChangeIndex > 0) {
      this.urlChanges.splice(this.urlChangeIndex + 1);
    }
    this.urlChanges.push(
        {...this.urlChanges[this.urlChangeIndex], pathname, search, hash, state: parsedState});
    this.urlChangeIndex = this.urlChanges.length - 1;
  }

  forward(): void {
    const oldUrl = this.url;
    const oldHash = this.hash;
    if (this.urlChangeIndex < this.urlChanges.length) {
      this.urlChangeIndex++;
    }
    this.scheduleHashUpdate(oldHash, oldUrl);
  }

  back(): void {
    const oldUrl = this.url;
    const oldHash = this.hash;
    if (this.urlChangeIndex > 0) {
      this.urlChangeIndex--;
    }
    this.scheduleHashUpdate(oldHash, oldUrl);
  }

  historyGo(relativePosition: number = 0): void {
    const oldUrl = this.url;
    const oldHash = this.hash;
    const nextPageIndex = this.urlChangeIndex + relativePosition;
    if (nextPageIndex >= 0 && nextPageIndex < this.urlChanges.length) {
      this.urlChangeIndex = nextPageIndex;
    }
    this.scheduleHashUpdate(oldHash, oldUrl);
  }

  getState(): unknown {
    return this.state;
  }

  private scheduleHashUpdate(oldHash: string, oldUrl: string) {
    if (oldHash !== this.hash) {
      scheduleMicroTask(
          () => this.hashUpdate.next(
              {type: 'hashchange', state: null, oldUrl, newUrl: this.url} as LocationChangeEvent));
    }
  }
}

export function scheduleMicroTask(cb: () => any) {
  Promise.resolve(null).then(cb);
}
