'use strict';

import * as vscode from 'vscode';


export function breakpoint(): void {
    console.log("breakpoint");

    debugger;
}

export function errorBreak(...message: any[]): void {
    console.error(...message);
    breakpoint();
}
export function warningBreak(...message: any[]): void {
    console.warn(...message);
    breakpoint();
}
export function logBreak(...message: any[]): void {
    console.log(...message);
    breakpoint();
}