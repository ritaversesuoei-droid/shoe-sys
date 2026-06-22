/**
 * アプリ共通エラー。status を持ち、API層(handle)が HTTP ステータスへ変換する。
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 認証・認可エラー（401/403） */
export class AuthError extends AppError {}

/** 打刻の業務ルール違反（二重打刻・順序不正など）。409 Conflict。 */
export class PunchError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
