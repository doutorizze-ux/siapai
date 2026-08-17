import { getDb } from "./db";

export async function getCompletedRevisaActivities(
  licenseId: number,
  materialId: number,
  componentId: number,
  sequenceId: number,
) {
  const [rows] = await getDb().query(
    `SELECT activityId FROM revisa_progress
     WHERE licenseId = ? AND materialId = ? AND componentId = ? AND sequenceId = ?
     ORDER BY activityId ASC`,
    [licenseId, materialId, componentId, sequenceId],
  );
  return (rows as Array<{ activityId: number }>).map((row) => Number(row.activityId));
}

export async function registerCompletedRevisaActivities(input: {
  licenseId: number;
  materialId: number;
  componentId: number;
  sequenceId: number;
  activityIds: number[];
  lessonNumber?: string;
}) {
  const ids = Array.from(new Set(input.activityIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return 0;
  const values = ids.map(() => "(?, ?, ?, ?, ?, ?, NOW())").join(", ");
  const params: Array<number | string> = [];
  ids.forEach((activityId) => {
    params.push(input.licenseId, input.materialId, input.componentId, input.sequenceId, activityId, String(input.lessonNumber || ""));
  });
  const [result] = await getDb().query(
    `INSERT INTO revisa_progress (licenseId, materialId, componentId, sequenceId, activityId, lessonNumber, completedAt)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE lessonNumber = VALUES(lessonNumber), completedAt = NOW()`,
    params,
  );
  return Number((result as { affectedRows?: number }).affectedRows || 0);
}
