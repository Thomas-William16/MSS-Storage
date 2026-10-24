import React, {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import { Actions } from "./primitives.jsx";
import { Button } from "./Button.jsx";
import { Dialog } from "./Dialog.jsx";
import { useUI } from "./context.js";
export function Form({
  children,
  onSubmit,
  submit = "Save",
  close,
  className = "",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState({});
  const ref = useRef(null);
  const lock = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    const fields = [...ref.current.elements].filter(
      (input) => input.name && input.willValidate,
    );
    const errors = Object.fromEntries(
      fields
        .filter((input) => !input.checkValidity())
        .map((input) => [input.name, input.validationMessage]),
    );
    setInvalid(errors);
    setError(null);
    if (Object.keys(errors).length) {
      fields.find((input) => errors[input.name])?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await onSubmit(new FormData(ref.current));
    } catch (err) {
      setError(err.message);
      setInvalid(err.fields || {});
      const field = fields.find((input) => err.fields?.[input.name]);
      if (field) field.focus();
      else ref.current.querySelector('[role="alert"]')?.focus();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <FormState.Provider value={invalid}>
      <form
        ref={ref}
        noValidate
        className={className}
        onSubmit={save}
        aria-busy={busy}
        onInput={(event) => {
          const name = event.target.name;
          if (invalid[name])
            setInvalid((current) => ({ ...current, [name]: undefined }));
        }}
      >
        <fieldset className="form-fields" disabled={busy}>
          {children}
        </fieldset>
        {error && (
          <p className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        <Actions>
          {close && (
            <Button disabled={busy} onClick={() => close(null)}>
              Cancel
            </Button>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : submit}
          </button>
          {busy && (
            <span className="muted" role="status">
              Saving…
            </span>
          )}
        </Actions>
      </form>
    </FormState.Provider>
  );
}
const FormState = createContext({});
export function Field({ label, name, children, hint, ...props }) {
  const id = useId();
  const errors = useContext(FormState);
  const error = errors[name];
  const child = children || <input {...props} />;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(child, {
        id,
        name,
        "aria-invalid": error ? "true" : undefined,
        "aria-describedby": error || hint ? `${id}-help` : undefined,
      })}
      {(error || hint) && (
        <small id={`${id}-help`} className={error ? "form-error" : "muted"}>
          {error || hint}
        </small>
      )}
    </div>
  );
}
export function FormDialog({
  title,
  fields: initialFields,
  onSubmit,
  close,
  submit = "Save",
  intro,
  success = "Saved successfully",
}) {
  const [fields, setFields] = useState(initialFields);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      initialFields.map((field) => [
        field.name,
        field.value ??
          (field.type === "select" ? field.options?.[0]?.value || "" : ""),
      ]),
    ),
  );
  const ui = useUI();
  return (
    <Dialog title={title} close={close}>
      <Form
        close={close}
        submit={submit}
        onSubmit={async () => {
          const data = {};
          for (const field of fields) {
            const value = values[field.name];
            if (value === "" && field.required === false) continue;
            data[field.name] = field.type === "number" ? Number(value) : value;
          }
          const result = await onSubmit(data);
          close(result ?? true);
          if (success !== false)
            ui.toast(typeof result === "string" ? result : success);
        }}
      >
        {intro && <p className="muted">{intro}</p>}
        {fields.map((field) => {
          const props = {
            required: field.required ?? field.type !== "textarea",
            value: values[field.name],
            onChange: (event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.target.value,
              })),
            min: field.min,
            max: field.max,
            step: field.step,
            minLength: field.minLength,
            maxLength: field.maxLength || 2000,
            autoComplete: field.autocomplete || "off",
            placeholder: field.placeholder,
          };
          return (
            <React.Fragment key={field.name}>
              <Field name={field.name} label={field.label} hint={field.hint}>
                {field.type === "select" ? (
                  <select {...props}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea {...props} rows={3} />
                ) : (
                  <input {...props} type={field.type || "text"} />
                )}
              </Field>
              {field.action && (
                <Button
                  onClick={async () => {
                    const result = await field.action.run();
                    if (result) {
                      setFields((current) =>
                        current.map((item) =>
                          item.name === field.name
                            ? { ...item, options: result.options }
                            : item,
                        ),
                      );
                      setValues((current) => ({
                        ...current,
                        [field.name]: result.value,
                      }));
                    }
                  }}
                >
                  {field.action.label}
                </Button>
              )}
            </React.Fragment>
          );
        })}
      </Form>
    </Dialog>
  );
}
export function ConfirmDialog({ title, message, action, close }) {
  return (
    <Dialog title={title} close={close}>
      <p>{message}</p>
      <Form
        close={close}
        submit="Confirm"
        onSubmit={async () => {
          await action?.();
          close(true);
        }}
      />
    </Dialog>
  );
}
