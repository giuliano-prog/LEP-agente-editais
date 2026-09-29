"""Trava do workflow de migrações de TESTE (staging).

Confere STAGING_SUPABASE_DB_URL antes de qualquer conexão e recusa:
  • segredo ausente ou connection string inválida;
  • variável PRODUCTION_SUPABASE_REF ausente (sem ela a trava não funciona);
  • URL cujo projeto Supabase não pode ser identificado;
  • URL que aponta para o projeto de PRODUÇÃO.

Uso (no GitHub Actions): python3 scripts/check-staging-db-url.py
Lê STAGING_SUPABASE_DB_URL e PRODUCTION_SUPABASE_REF do ambiente. Nunca imprime a URL.
"""

import os
import re
import sys
from urllib.parse import unquote, urlsplit


def fail(message: str) -> None:
    # Comandos do GitHub Actions precisam sair na saída padrão (stdout).
    print(f"::error::{message}")
    sys.exit(1)


def project_refs(url) -> set:
    """Identificadores do projeto Supabase presentes na URL (usuário do pooler e/ou host direto)."""
    refs = set()
    user = unquote(url.username or "").lower()
    if user.startswith("postgres."):
        refs.add(user.split(".", 1)[1])
    host = (url.hostname or "").lower()
    match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", host)
    if match:
        refs.add(match.group(1))
    return {ref for ref in refs if ref}


def main() -> None:
    raw = os.environ.get("STAGING_SUPABASE_DB_URL", "")
    production_ref = os.environ.get("PRODUCTION_SUPABASE_REF", "").strip().lower()

    if not raw:
        fail(
            "Segredo STAGING_SUPABASE_DB_URL ausente. Configure em Settings → Environments → staging."
        )

    url = urlsplit(raw)
    # Mascara a senha (original e decodificada) antes de qualquer outra mensagem.
    for value in {url.password or "", unquote(url.password or "")}:
        if value:
            print(f"::add-mask::{value}")

    if url.scheme not in ("postgresql", "postgres"):
        fail("STAGING_SUPABASE_DB_URL deve começar com postgresql://")
    if not url.password:
        fail("STAGING_SUPABASE_DB_URL sem senha.")
    if url.port == 6543:
        fail(
            "Porta 6543 (transaction pooler) não é compatível com migrações. Use o Session pooler (porta 5432)."
        )

    if not re.fullmatch(r"[a-z0-9]+", production_ref):
        fail(
            "Variável PRODUCTION_SUPABASE_REF ausente ou inválida: sem ela não dá para garantir que o banco "
            "não é o de produção. Configure em Settings → Environments → staging → Variables."
        )

    refs = project_refs(url)
    if not refs:
        fail(
            "Não foi possível identificar o projeto Supabase na URL (esperado usuário postgres.<ref> do "
            "Session pooler ou host db.<ref>.supabase.co). Execução recusada."
        )
    if len(refs) > 1:
        fail("A URL cita mais de um projeto Supabase. Execução recusada.")
    if production_ref in refs:
        fail(
            "STAGING_SUPABASE_DB_URL aponta para o projeto de PRODUÇÃO. Execução recusada: "
            "este workflow só pode usar o banco de TESTE."
        )

    print("Connection string de TESTE válida e diferente da produção (senha mascarada nos logs).")


if __name__ == "__main__":
    main()
