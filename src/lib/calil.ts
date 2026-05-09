const BASE = '/api/calil';

export interface CalilLibrary {
  systemid: string;
  systemname: string;
  libkey: string;
  libname: string;
  address: string;
  pref: string;
  city: string;
  url: string;
}

export type LibStatus =
  | '貸出可'
  | '蔵書あり'
  | '館内のみ'
  | '貸出中'
  | '予約中'
  | '準備中'
  | '休館中'
  | '蔵書なし';

export interface BookAvailability {
  systemid: string;
  systemname: string;
  status: string;
  reserveurl: string;
  libkey: Record<string, LibStatus>;
}

interface CheckResponse {
  session: string;
  continue: 0 | 1;
  books: Record<string, Record<string, {
    status: string;
    reserveurl: string;
    libkey: Record<string, LibStatus>;
  }>>;
}

export async function getLibraries(
  appkey: string,
  pref: string
): Promise<CalilLibrary[]> {
  const params = new URLSearchParams({ appkey, pref, format: 'json', callback: 'no' });
  const res = await fetch(`${BASE}/library?${params}`);
  if (!res.ok) throw new Error('図書館情報の取得に失敗しました');
  return res.json();
}

async function checkOnce(
  appkey: string,
  isbn: string,
  systemids: string[],
  session?: string
): Promise<CheckResponse> {
  const params = new URLSearchParams({
    appkey,
    isbn,
    systemid: systemids.join(','),
    format: 'json',
    callback: 'no',
  });
  if (session) params.set('session', session);
  const res = await fetch(`${BASE}/check?${params}`);
  if (!res.ok) throw new Error('蔵書確認に失敗しました');
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function checkAvailability(
  appkey: string,
  isbn: string,
  libraries: CalilLibrary[],
  onUpdate: (results: BookAvailability[]) => void
): Promise<void> {
  const systemMap = new Map<string, CalilLibrary>();
  for (const lib of libraries) systemMap.set(lib.systemid, lib);

  const systemids = [...new Set(libraries.map((l) => l.systemid))].slice(0, 9);

  function parseResults(data: CheckResponse): BookAvailability[] {
    const bookData = data.books[isbn] ?? {};
    return Object.entries(bookData).map(([sysid, info]) => ({
      systemid: sysid,
      systemname: systemMap.get(sysid)?.systemname ?? sysid,
      status: info.status,
      reserveurl: info.reserveurl,
      libkey: info.libkey ?? {},
    }));
  }

  let data = await checkOnce(appkey, isbn, systemids);
  onUpdate(parseResults(data));

  while (data.continue === 1) {
    await sleep(2000);
    data = await checkOnce(appkey, isbn, systemids, data.session);
    onUpdate(parseResults(data));
  }
}

export const PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
] as const;

export type Pref = typeof PREFS[number];

const APPKEY_STORAGE = 'calil-appkey';
const PREF_STORAGE = 'calil-pref';

export function loadAppKey(): string {
  return localStorage.getItem(APPKEY_STORAGE) ?? '';
}
export function saveAppKey(key: string) {
  localStorage.setItem(APPKEY_STORAGE, key);
}
export function loadPref(): string {
  return localStorage.getItem(PREF_STORAGE) ?? '東京都';
}
export function savePref(pref: string) {
  localStorage.setItem(PREF_STORAGE, pref);
}
