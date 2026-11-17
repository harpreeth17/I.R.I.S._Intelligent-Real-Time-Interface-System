import { useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_FORM = {
  name: '',
  personal: { fullName: '', preferredName: '', ageOrDob: '', gender: '', photo: '' },
  caregiver: { name: '', relationship: '', contactNumber: '', emergencyContact: '' },
  accessibility: {
    keyboardSize: 'large',
    cursorSpeed: 1,
    dwellDuration: 0.8,
    displayContrast: 'standard',
    preferredTheme: 'dark',
    voiceTyping: true,
    interfaceFontSize: 'large',
    textDisplay: 'large',
  },
};

function cloneForm(profile = {}) {
  const accessibility = profile.accessibility || {};
  const interfaceFontSize = accessibility.interfaceFontSize || accessibility.textDisplay || 'large';
  return {
    name: profile.name || '',
    personal: { ...EMPTY_FORM.personal, ...(profile.personal || {}) },
    caregiver: { ...EMPTY_FORM.caregiver, ...(profile.caregiver || {}) },
    accessibility: { ...EMPTY_FORM.accessibility, ...accessibility, interfaceFontSize, textDisplay: interfaceFontSize },
  };
}

function validateProfileName(name, profiles, currentName = null) {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a profile name';
  if (trimmed.length > 64) return 'Profile names must be 64 characters or fewer';
  if (/[\\/:*?"<>|]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
    return 'Profile name contains invalid characters';
  }
  if (/[. ]$/.test(trimmed)) return 'Profile name cannot end with a space or period';
  if (profiles.some((profile) => profile.name.toLowerCase() === trimmed.toLowerCase() && profile.name !== currentName)) {
    return 'A profile with that name already exists';
  }
  return null;
}

function Field({ label, value, onChange, required = false, type = 'text', ...props }) {
  return (
    <label className="text-sm text-slate-200">
      {label}{required && <span className="ml-1 text-cyan-200">*</span>}
      <input
        {...props}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[48px] w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 text-slate-100 outline-none focus:border-cyan-300/50"
      />
    </label>
  );
}

export default function ProfilesScreen({
  profiles = [],
  profileDetails = [],
  activeProfile,
  feedback,
  connected,
  send,
  clearFeedback,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingName, setEditingName] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const pendingRequestRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const items = useMemo(
    () => (profileDetails.length ? profileDetails : profiles.map((name) => ({ name, calibrated: false }))),
    [profileDetails, profiles],
  );

  useEffect(() => {
    if (!feedback || !pendingAction) return;
    if (feedback.ok) {
      setLocalError(null);
      setFieldErrors({});
      setPendingAction(null);
      pendingRequestRef.current = false;
      if (pendingAction === 'create') {
        setForm(EMPTY_FORM);
        setShowCreateForm(false);
      }
      if (pendingAction === 'update') {
        setEditingName(null);
        setForm(EMPTY_FORM);
        setShowCreateForm(false);
      }
    } else {
      setLocalError(feedback.error || 'Profile operation failed');
      setPendingAction(null);
      pendingRequestRef.current = false;
    }
  }, [feedback, pendingAction]);

  const updateSection = (section, key, value) => {
    setForm((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
    setLocalError(null);
    setFieldErrors((current) => ({
      ...current,
      [`${section}.${key}`]: null,
      ...(section === 'personal' && key === 'fullName' ? { fullName: null } : {}),
    }));
  };

  const sendProfile = (message, action) => {
    if (pendingRequestRef.current) return false;
    clearFeedback?.();
    pendingRequestRef.current = true;
    if (!connected || !send(message)) {
      setLocalError('The backend is not connected. Start I.R.I.S. and try again.');
      pendingRequestRef.current = false;
      return false;
    }
    setPendingAction(action);
    return true;
  };

  const submit = () => {
    if (pendingRequestRef.current) return;
    const nameError = validateProfileName(form.name, items, editingName);
    const errors = {
      name: nameError,
      fullName: form.personal.fullName.trim() ? null : 'Full name is required',
    };
    setFieldErrors(errors);
    if (nameError || errors.fullName) {
      setLocalError(null);
      return;
    }
    sendProfile(
      {
        type: editingName ? 'update_profile' : 'create_profile',
        name: editingName || form.name.trim(),
        profile: {
          personal: form.personal,
          caregiver: form.caregiver,
          accessibility: form.accessibility,
        },
      },
      editingName ? 'update' : 'create',
    );
  };

  const beginEdit = (profile) => {
    setEditingName(profile.name);
    setForm(cloneForm(profile));
    setShowCreateForm(true);
    setLocalError(null);
    setFieldErrors({});
  };

  const beginCreate = () => {
    setEditingName(null);
    setForm(EMPTY_FORM);
    setShowCreateForm(true);
    setLocalError(null);
    setFieldErrors({});
  };

  const deleteProfile = (profile) => {
    if (profile.name === activeProfile) return;
    setDeleteTarget(profile);
    setLocalError(null);
  };

  const confirmDeleteProfile = () => {
    if (!deleteTarget) return;
    const sent = sendProfile({ type: 'delete_profile', name: deleteTarget.name }, 'delete');
    if (sent) setDeleteTarget(null);
  };

  const handlePhoto = (file) => {
    if (!file) return;
    if (file.size > 512000) {
      setLocalError('Profile photo must be 500 KB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateSection('personal', 'photo', String(reader.result || ''));
    reader.onerror = () => setLocalError('The profile photo could not be read');
    reader.readAsDataURL(file);
  };

  const feedbackMessage = feedback?.ok ? feedback.message || 'Profile operation completed.' : feedback?.error;
  const formTitle = editingName ? `Edit ${editingName}` : 'Create a user profile';

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-auto rounded-3xl border border-sky-300/20 bg-[#101a31] p-5 lg:p-6">
      <header>
        <h2 className="text-2xl font-semibold text-sky-100">Profiles</h2>
        <p className="mt-1 text-base text-slate-300">
          Keep personal details, accessibility preferences, and calibration data together. Optional information can be left blank.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="order-1 flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-sky-300/25 bg-[#0b1226] p-5 text-center text-base text-slate-400">
          No saved profiles yet. Create a profile, then complete calibration separately.
        </div>
      ) : (
        <div className="order-1 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((profile) => {
            const isActive = profile.name === activeProfile;
            const calibration = profile.calibration || {};
            return (
              <article key={profile.name} className={`rounded-2xl border p-3 ${isActive ? 'border-teal-300/45 bg-teal-300/10' : 'border-sky-300/20 bg-[#0b1226]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-xl font-semibold text-slate-100">{profile.personal?.preferredName || profile.personal?.fullName || profile.name}</h3>
                    <p className="text-base text-slate-300">{profile.name}</p>
                    <p className={`mt-1 text-sm ${profile.calibrated ? 'text-teal-200' : 'text-amber-200'}`}>{calibration.status || (profile.calibrated ? 'Validated' : 'Uncalibrated')}</p>
                    {calibration.lastCalibratedAt && <p className="text-sm text-slate-400">Calibration date: {new Date(calibration.lastCalibratedAt * 1000).toLocaleDateString()}</p>}
                    {calibration.screenWidth && <p className="text-sm text-slate-400">Calibration screen: {calibration.screenWidth} × {calibration.screenHeight}</p>}
                  </div>
                  {isActive && <span className="shrink-0 rounded-full border border-teal-300/40 bg-teal-300/15 px-3 py-1 text-sm text-teal-100">Active</span>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button type="button" disabled={isActive || Boolean(pendingAction)} onClick={() => sendProfile({ type: 'load_profile', name: profile.name }, 'load')} className="min-h-[48px] rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-2 text-sm text-cyan-100 disabled:opacity-50">{isActive ? 'Loaded' : 'Select'}</button>
                  <button type="button" onClick={() => beginEdit(profile)} className="min-h-[48px] rounded-xl border border-sky-300/25 bg-sky-300/5 px-2 text-sm text-slate-200">Edit</button>
                  <button type="button" disabled={isActive || Boolean(pendingAction)} onClick={() => deleteProfile(profile)} title={isActive ? 'The active profile cannot be deleted. Select another profile first.' : 'Delete this profile and its associated calibration data.'} aria-label={isActive ? `Delete ${profile.name} unavailable because it is active` : `Delete ${profile.name}`} className="min-h-[48px] rounded-xl border border-rose-300/30 bg-rose-400/10 px-2 text-sm text-rose-100 disabled:cursor-not-allowed disabled:opacity-50">{isActive ? 'Delete (active)' : 'Delete'}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="order-2 flex justify-start">
        {!showCreateForm && (
          <button type="button" onClick={beginCreate} className="min-h-[52px] rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-5 text-base text-cyan-100">
            Create New Profile
          </button>
        )}
      </div>

      {showCreateForm && <div className="order-3 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-100">{formTitle}</h3>
          {editingName && (
            <button type="button" onClick={() => { setEditingName(null); setForm(EMPTY_FORM); setShowCreateForm(false); }} className="min-h-[48px] rounded-xl border border-slate-300/25 px-4 text-slate-200">
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-sky-300/15 p-3">
            <h4 className="iris-section-heading font-semibold text-cyan-100">Personal information</h4>
            <Field label="Profile name" required value={form.name} onChange={(value) => {
              setForm((current) => ({ ...current, name: value }));
              setFieldErrors((current) => ({ ...current, name: null }));
            }} placeholder="e.g. Summit Demo" />
            {fieldErrors.name && <p className="mt-1 text-sm text-rose-200">{fieldErrors.name}</p>}
            <Field label="Full name" required value={form.personal.fullName} onChange={(value) => updateSection('personal', 'fullName', value)} />
            {fieldErrors.fullName && <p className="mt-1 text-sm text-rose-200">{fieldErrors.fullName}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Preferred name" value={form.personal.preferredName} onChange={(value) => updateSection('personal', 'preferredName', value)} />
              <Field label="Age or date of birth" value={form.personal.ageOrDob} onChange={(value) => updateSection('personal', 'ageOrDob', value)} />
              <Field label="Gender" value={form.personal.gender} onChange={(value) => updateSection('personal', 'gender', value)} />
              <label className="text-sm text-slate-200">
                Profile photo
                <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} className="mt-1 block min-h-[48px] w-full py-3 text-sm text-slate-300" />
              </label>
            </div>
            {form.personal.photo && <img src={form.personal.photo} alt="Profile preview" className="h-16 w-16 rounded-full object-cover" />}
          </div>

          <div className="space-y-3 rounded-xl border border-sky-300/15 p-3">
            <h4 className="iris-section-heading font-semibold text-cyan-100">Caregiver information <span className="iris-supporting font-normal text-slate-400">(optional)</span></h4>
            <Field label="Caregiver name" value={form.caregiver.name} onChange={(value) => updateSection('caregiver', 'name', value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Relationship" value={form.caregiver.relationship} onChange={(value) => updateSection('caregiver', 'relationship', value)} />
              <Field label="Contact number" value={form.caregiver.contactNumber} onChange={(value) => updateSection('caregiver', 'contactNumber', value)} />
            </div>
            <Field label="Emergency contact" value={form.caregiver.emergencyContact} onChange={(value) => updateSection('caregiver', 'emergencyContact', value)} />
          </div>

          <div className="space-y-3 rounded-xl border border-sky-300/15 p-3 lg:col-span-2">
            <h4 className="iris-section-heading font-semibold text-cyan-100">Accessibility preferences</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-slate-200">Keyboard size
                <select value={form.accessibility.keyboardSize} onChange={(event) => updateSection('accessibility', 'keyboardSize', event.target.value)} className="mt-1 min-h-[48px] w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 text-slate-100">
                  <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
                </select>
              </label>
              <label className="text-sm text-slate-200">Cursor speed: {form.accessibility.cursorSpeed}
                <input type="range" min="0.25" max="2" step="0.05" value={form.accessibility.cursorSpeed} onChange={(event) => updateSection('accessibility', 'cursorSpeed', Number(event.target.value))} className="mt-4 w-full" />
              </label>
              <label className="text-sm text-slate-200">Dwell duration: {form.accessibility.dwellDuration}s
                <input type="range" min="0.3" max="3" step="0.1" value={form.accessibility.dwellDuration} onChange={(event) => updateSection('accessibility', 'dwellDuration', Number(event.target.value))} className="mt-4 w-full" />
              </label>
              <label className="text-sm text-slate-200">Display contrast
                <select value={form.accessibility.displayContrast} onChange={(event) => updateSection('accessibility', 'displayContrast', event.target.value)} className="mt-1 min-h-[48px] w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 text-slate-100">
                  <option value="standard">Standard</option><option value="high">High</option>
                </select>
              </label>
              <label className="text-sm text-slate-200">Preferred theme
                <select value={form.accessibility.preferredTheme} onChange={(event) => updateSection('accessibility', 'preferredTheme', event.target.value)} className="mt-1 min-h-[48px] w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 text-slate-100">
                  <option value="dark">Dark</option><option value="light">Light</option>
                </select>
              </label>
              <label className="text-sm text-slate-200">Text scaling
                <select value={form.accessibility.interfaceFontSize} onChange={(event) => updateSection('accessibility', 'interfaceFontSize', event.target.value)} className="mt-1 min-h-[48px] w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 text-slate-100">
                  <option value="small">Small (15px)</option><option value="standard">Standard (17px)</option><option value="large">Large (19px)</option><option value="extra_large">Extra Large (21px)</option>
                </select>
              </label>
              <label className="flex min-h-[48px] items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={form.accessibility.voiceTyping} onChange={(event) => updateSection('accessibility', 'voiceTyping', event.target.checked)} />
                Enable voice typing
              </label>
            </div>
          </div>
        </div>

        {localError && <p className="mt-3 text-sm text-rose-200">{localError}</p>}
        {feedbackMessage && <p className={`mt-3 text-sm ${feedback.ok ? 'text-teal-200' : 'text-rose-200'}`}>{feedbackMessage}</p>}
        <button type="button" onClick={submit} disabled={Boolean(pendingAction)} className="mt-4 min-h-[56px] rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-5 text-base text-cyan-100 disabled:opacity-50">
          {pendingAction ? 'Saving...' : editingName ? 'Save profile details' : 'Create profile'}
        </button>
      </div>}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-profile-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-rose-300/40 bg-[#101a31] p-6 shadow-2xl">
            <h3 id="delete-profile-title" className="iris-section-heading font-semibold text-rose-100">
              Delete profile?
            </h3>
            <p className="mt-3 text-base text-slate-200">
              Delete <strong>{deleteTarget.name}</strong>? Its saved profile information and associated calibration data will also be deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[52px] rounded-xl border border-slate-300/30 px-5 text-base text-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProfile}
                disabled={Boolean(pendingAction)}
                className="min-h-[52px] rounded-xl border border-rose-300/50 bg-rose-400/15 px-5 text-base text-rose-100 disabled:opacity-50"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
