export function SavePointDialog() {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <label htmlFor="save-point-name">Save point name</label>
      <input id="save-point-name" placeholder="Before export" />
      <label htmlFor="save-point-note">Note</label>
      <textarea id="save-point-note" placeholder="What changed?" />
      <button>Create Save Point</button>
    </div>
  );
}
