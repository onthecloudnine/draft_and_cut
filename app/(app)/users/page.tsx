import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { getUsersForAdmin } from "@/lib/data/users";
import { UsersAdmin } from "./users-admin";

export default async function UsersPage() {
  const user = await requireUser();
  await assertCanManageUsers(user.id);
  const users = await getUsersForAdmin();

  return <UsersAdmin currentUserId={user.id} initialUsers={users} />;
}
