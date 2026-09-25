// Verificação em tempo de compilação: o enum do banco e os papéis do código precisam ser iguais.
import type { Role } from "../../core/src/auth/roles";
import type { AppRole } from "./index";

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const rolesInSync: Equals<Role, AppRole> = true;
void rolesInSync;
