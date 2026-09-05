// OPFS (Origin Private File System) の薄いラッパ。
// 入力動画は `inputs/{id}.{ext}` で元の拡張子を保持、出力は `outputs/{id}.mp4`。

import { extractExtension } from '../lib/format';

export const INPUTS_DIR = 'inputs';
export const OUTPUTS_DIR = 'outputs';

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS が利用できません');
  }
  return navigator.storage.getDirectory();
}

async function getSubDir(name: string): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDir();
  return root.getDirectoryHandle(name, { create: true });
}

/** "inputs/abc.mov" のようなパスを ["inputs", "abc.mov"] に分割 */
function splitPath(path: string): [string, string] {
  const idx = path.indexOf('/');
  if (idx <= 0) throw new Error(`不正な OPFS パス: ${path}`);
  const dir = path.slice(0, idx);
  const file = path.slice(idx + 1);
  if (!file) throw new Error(`不正な OPFS パス: ${path}`);
  return [dir, file];
}

/**
 * File を OPFS の inputs/{id}.{ext} に書き込み、パス文字列を返す。
 * 元の拡張子を保持する (.mov / .mp4 / .heic など)。
 */
export async function writeInputToOpfs(file: File, id: string): Promise<string> {
  const ext = extractExtension(file.name);
  const fileName = `${id}.${ext}`;
  const dir = await getSubDir(INPUTS_DIR);
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(file);
  } finally {
    await writable.close();
  }
  return `${INPUTS_DIR}/${fileName}`;
}

/**
 * OPFS パスからファイルを読み出す。
 * 存在しない場合は例外を投げる。
 */
export async function readFromOpfs(path: string): Promise<File> {
  const [dirName, fileName] = splitPath(path);
  const dir = await getSubDir(dirName);
  const handle = await dir.getFileHandle(fileName);
  return handle.getFile();
}

/**
 * OPFS パスのファイルを削除。
 * 存在しない場合は黙ってスキップ。
 */
export async function deleteFromOpfs(path: string): Promise<void> {
  try {
    const [dirName, fileName] = splitPath(path);
    const root = await getRootDir();
    const dir = await root.getDirectoryHandle(dirName);
    await dir.removeEntry(fileName);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return;
    // 削除失敗を成功扱いすると、参照だけ消えて動画が残る。
    throw err;
  }
}

/**
 * 書き込みハンドルを返す。transcode pipeline 用。
 * 呼び出し側で writable.close() を必ず呼ぶこと。
 */
export async function getOpfsWritable(path: string): Promise<FileSystemWritableFileStream> {
  const [dirName, fileName] = splitPath(path);
  const dir = await getSubDir(dirName);
  const handle = await dir.getFileHandle(fileName, { create: true });
  return handle.createWritable();
}

/**
 * outputs/ ディレクトリ内のすべてのファイル名を列挙。
 * Phase 4 で「キュー復元時に中途出力をクリーンアップ」する際に使う。
 */
export async function listOutputs(): Promise<string[]> {
  try {
    const dir = await getSubDir(OUTPUTS_DIR);
    const names: string[] = [];
    for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * outputs/{id}.mp4 のパス文字列を返す。
 * （ID を渡して outputOpfsPath を生成するヘルパ。）
 */
export function outputPath(id: string): string {
  return `${OUTPUTS_DIR}/${id}.mp4`;
}
