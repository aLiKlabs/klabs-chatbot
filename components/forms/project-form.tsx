"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { createProject, type ProjectActionState } from "@/app/actions/projects";

const initialState: ProjectActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <small className="field-error">{errors[0]}</small> : null;
}

export function ProjectForm() {
  const [state, action, pending] = useActionState(createProject, initialState);

  return (
    <form action={action} className="project-form">
      {state.error ? <div className="notice notice-error" role="alert">{state.error}</div> : null}
      <div className="form-section">
        <div>
          <p className="eyebrow">Client details</p>
          <h2>Start with the essentials</h2>
          <p>These details create the isolated workspace for this website.</p>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Project name</span>
            <input name="name" placeholder="Acme Website Assistant" required />
            <FieldError errors={state.fieldErrors?.name} />
          </label>
          <label className="field field-span-2">
            <span>Website URL</span>
            <input name="websiteUrl" type="url" placeholder="https://example.com" required />
            <FieldError errors={state.fieldErrors?.websiteUrl} />
          </label>
          <label className="field">
            <span>Default language</span>
            <select name="defaultLanguage" defaultValue="en">
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
          <fieldset className="field checkbox-field">
            <legend>Supported languages</legend>
            <label><input type="checkbox" name="supportedLanguages" value="en" defaultChecked /> English</label>
            <label><input type="checkbox" name="supportedLanguages" value="ar" defaultChecked /> Arabic</label>
          </fieldset>
        </div>
      </div>

      <div className="form-section">
        <div>
          <p className="eyebrow">First impression</p>
          <h2>Give the assistant a voice</h2>
          <p>You can refine every appearance setting later.</p>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Bot name</span>
            <input name="botName" defaultValue="Website Assistant" required />
          </label>
          <label className="field color-field">
            <span>Primary colour</span>
            <input name="primaryColor" type="color" defaultValue="#6758E8" required />
          </label>
          <label className="field field-span-2">
            <span>Welcome message</span>
            <textarea name="welcomeMessage" defaultValue="Hello! How can I help you today?" rows={3} required />
          </label>
          <label className="field">
            <span>Contact email <em>Optional</em></span>
            <input name="contactEmail" type="email" placeholder="hello@example.com" />
          </label>
          <label className="field">
            <span>WhatsApp number <em>Optional</em></span>
            <input name="whatsappNumber" inputMode="tel" placeholder="973XXXXXXXX" />
          </label>
          <input type="hidden" name="timezone" value="Asia/Bahrain" />
        </div>
      </div>

      <div className="form-actions">
        <p>The project begins in draft mode and cannot serve public chat yet.</p>
        <button className="button button-primary" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
          {pending ? "Creating project…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
