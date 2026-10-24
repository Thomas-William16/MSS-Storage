export class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export const fail = (status, message, fields) => {
  throw new AppError(status, message, fields);
};
