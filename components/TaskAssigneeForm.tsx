export function TaskAssigneeForm({ task, people }: { task: { id: string; assigneeId: string | null; updatedAt: Date }; people: Array<{ id: string; name: string }> }) {
  return <form className="task-assignee-form" action={`/api/tasks/${task.id}/members`} method="post">
    <input type="hidden" name="action" value="assign"/>
    <input type="hidden" name="revision" value={task.updatedAt.toISOString()}/>
    <label className="field"><span>Odpovědný za úkol</span><select name="userId" defaultValue={task.assigneeId || ""} required><option value="" disabled>Vyberte odpovědného</option>{people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
    <button className="secondary" type="submit">Přiřadit odpovědného</button>
  </form>;
}
