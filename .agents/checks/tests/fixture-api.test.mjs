import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureApiProps } from '../lib/fixture-api.mjs';

const implementations = [
  'export function PreviewGlyph(props: { initial: string }) { return null; }',
  'interface Props { initial: string } export function PreviewGlyph(props: Props) { return null; }',
  'type Props = { initial: string }; export const PreviewGlyph = (props: Props) => null;',
  'interface Base { initial: string } interface Props extends Base {} export const PreviewGlyph = (props: Props) => null;',
  'type Base = { initial: string }; type Props = Base & {}; export function PreviewGlyph(props: Props) { return null; }',
  'import type { FC } from "react"; interface Props { initial: string } export const PreviewGlyph: FC<Props> = props => null;',
  'import React from "react"; type Props = { initial: string }; export const PreviewGlyph: React.FunctionComponent<Props> = props => null;',
  'import { memo as cached } from "react"; interface Props { initial: string } const Inner = (props: Props) => null; export const PreviewGlyph = cached(Inner);',
  'import * as React from "react"; type Props = { initial: string }; export const PreviewGlyph = React.memo((props: Props) => null);',
  'import { forwardRef, memo } from "react"; interface Props { initial: string } export const PreviewGlyph = memo(forwardRef<HTMLSpanElement, Props>((props, ref) => null));',
  'type Props = { initial: string }; const Inner = (props: Props) => null; export { Inner as PreviewGlyph };',
];
for (const [i,source] of implementations.entries()) test(`API representation ${i+1}: equivalent named API is resolved without executing code`,()=> {
  assert.deepEqual(fixtureApiProps(source,'PreviewGlyph'),['initial']);
  assert.deepEqual(fixtureApiProps(source.replace('initial: string','initial: string; imageSrc?: string'),'PreviewGlyph'),['initial','imageSrc']);
});
test('unresolved, dynamic and ambiguous APIs remain unknown',()=> {
  for (const source of [
    'import { Props } from "./missing"; export const PreviewGlyph = (props: Props) => null;',
    'type Props = { initial: string } | { imageSrc: string }; export const PreviewGlyph = (props: Props) => null;',
    'interface Props extends Unknown { initial: string } export function PreviewGlyph(props: Props) { return null; }',
    'type Props = Other; type Other = Props; export function PreviewGlyph(props: Props) { return null; }',
    'export function PreviewGlyph<T>(props: T) { return null; }',
    'interface Props { [key: string]: string } export const PreviewGlyph = (props: Props) => null;',
    'const memo = (x: unknown) => x; export const PreviewGlyph = memo((props: {initial: string}) => null);',
    'const PreviewGlyph = Other; const Other = PreviewGlyph;',
    'export function PreviewGlyph(props: {initial: string} {',
  ]) assert.equal(fixtureApiProps(source,'PreviewGlyph'),null);
});
test('an exported alias does not rebind local identifiers inside memo or value aliases',()=> {
  const source='import {memo} from "react"; const Impl=(props:{initial:string})=>null; const Inner=(props:{imageSrc?:string})=>null; const Wrapped=memo(Inner); export {Impl as Inner, Wrapped as PreviewGlyph};';
  assert.deepEqual(fixtureApiProps(source,'PreviewGlyph'),['imageSrc']);
  assert.deepEqual(fixtureApiProps(source,'Inner'),['initial']);
  assert.deepEqual(fixtureApiProps(source.replace('memo(Inner)','Inner'),'PreviewGlyph'),['imageSrc']);
});
test('unresolved public exports never fall back to private bindings of the same name',()=> {
  const local='const PreviewGlyph = (props: {initial: string}) => null;';
  for(const statement of ['export {Remote as PreviewGlyph} from "./external";','export * as PreviewGlyph from "./external";','export * from "./external";','export type {Remote as PreviewGlyph} from "./external";']) assert.equal(fixtureApiProps(statement+local,'PreviewGlyph'),null);
  assert.deepEqual(fixtureApiProps('export * from "./external"; export function PreviewGlyph(props:{initial:string}) {return null;}','PreviewGlyph'),['initial']);
});
