"use client";

import { useActionState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { updateProject, type ProjectActionState } from "@/app/actions/projects";
import type { Project } from "@/types/database";

export function EditProjectForm({ project }: { project: Project }) {
  const boundAction = updateProject.bind(null, project.id);
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(boundAction, {});

  return (
    <form action={action} className="settings-form">
      <div className="form-grid">
        <label className="field field-span-2"><span>Project name</span><input name="name" defaultValue={project.name} required />{state.fieldErrors?.name?.[0] ? <small className="field-error">{state.fieldErrors.name[0]}</small> : null}</label>
        <label className="field field-span-2"><span>Website URL</span><input name="websiteUrl" type="url" defaultValue={project.website_url} required />{state.fieldErrors?.websiteUrl?.[0] ? <small className="field-error">{state.fieldErrors.websiteUrl[0]}</small> : null}</label>
        <label className="field"><span>Default language</span><select name="defaultLanguage" defaultValue={project.default_language}><option value="en">English</option><option value="ar">Arabic</option></select></label>
        <fieldset className="field checkbox-field"><legend>Supported languages</legend><label><input name="supportedLanguages" type="checkbox" value="en" defaultChecked={project.supported_languages.includes("en")} /> English</label><label><input name="supportedLanguages" type="checkbox" value="ar" defaultChecked={project.supported_languages.includes("ar")} /> Arabic</label></fieldset>
        <label className="field field-span-2"><span>Timezone</span><input name="timezone" defaultValue={project.timezone} required /></label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {!state.error && Object.keys(state).length === 0 && !pending ? null : null}
      <button className="button button-primary" disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
