-- =====================================================================
-- Testes do Assistente LEP (ADR-0027): conversa, execuções, ações, achados, textos.
-- Tudo roda em uma transação desfeita no final (ROLLBACK).
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function tests.ok(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

create function tests.throws(p_sql text, p_message text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % [%]', p_message, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % (era esperado um erro)', p_message;
end;
$$;

create function tests.affected(p_sql text) returns integer language plpgsql as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- Org A: ADM (a), Diretoria (e), Equipe (f), membro suspenso (s). Org B: ADM (b0).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adm@teste.local'),
  ('00000000-0000-0000-0000-00000000000e', 'diretoria@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'equipe@teste.local'),
  ('00000000-0000-0000-0000-000000000005', 'suspenso@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'adm-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role, status) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', 'editor', 'suspended'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin', 'active');
insert into core.editais (id, org_id, title) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Edital A2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Edital B');
insert into core.projetos (id, org_id, title, format, stage) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Produção A', 'feature_film', 'development'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Produção B', 'short_film', 'development');
-- Áreas de trabalho (como servidor): A1 e A2 da Org A, B1 da Org B.
insert into core.edital_workspaces (id, org_id, edital_id) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1'),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2'),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1');
insert into core.edital_workspace_items (id, org_id, workspace_id, title) values
  ('60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Certidão'),
  ('60000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'Outro edital');

select tests.throws(
  $$update core.edital_workspace_items set confidence = 'certeza' where id = '60000000-0000-0000-0000-0000000000a1'$$,
  'confiança só aceita confirmado / inferido / não encontrado / precisa de confirmação');
select tests.throws(
  $$update core.edital_workspace_items set updated_via = 'robo' where id = '60000000-0000-0000-0000-0000000000a1'$$,
  'autoria só usuário ou assistente');

-- Equipe (viewer): consulta, não aciona o agente ---------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.throws(
  $$insert into core.assistant_conversations (org_id, workspace_id) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1')$$,
  'Equipe não inicia conversa com o agente');

-- Diretoria (editor): conversa, execução, ações, achados ---------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
insert into core.assistant_conversations (id, org_id, workspace_id)
values ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1');
select tests.throws(
  $$insert into core.assistant_conversations (org_id, workspace_id) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1')$$,
  'uma conversa por área de trabalho');
select tests.throws(
  $$insert into core.assistant_conversations (org_id, workspace_id) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000b1')$$,
  'não cria conversa em área de trabalho de outra organização');

insert into core.agent_runs (id, org_id, conversation_id, workspace_id, kind, request, max_steps)
values ('71000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1',
        '40000000-0000-0000-0000-0000000000a1', 'full_analysis', 'Analise completamente este edital.', 24);
select tests.ok(
  (select started_by = '00000000-0000-0000-0000-00000000000e' and status = 'queued' from core.agent_runs
   where id = '71000000-0000-0000-0000-0000000000a1'),
  'execução registra quem iniciou e começa na fila');
select tests.throws(
  $$insert into core.agent_runs (org_id, conversation_id, workspace_id, request) values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a2', 'x')$$,
  'execução não mistura conversa de um edital com área de trabalho de outro');
select tests.throws(
  $$update core.agent_runs set status = 'talvez' where id = '71000000-0000-0000-0000-0000000000a1'$$,
  'status da execução só aceita os valores previstos');
select tests.throws(
  $$update core.agent_runs set started_by = '00000000-0000-0000-0000-00000000000a' where id = '71000000-0000-0000-0000-0000000000a1'$$,
  'quem iniciou a execução não é editável');

insert into core.assistant_messages (org_id, conversation_id, run_id, role, content, author_id)
values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', '71000000-0000-0000-0000-0000000000a1',
        'user', 'Analise completamente este edital.', '00000000-0000-0000-0000-00000000000e');
insert into core.assistant_messages (org_id, conversation_id, run_id, role, content)
values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', '71000000-0000-0000-0000-0000000000a1',
        'assistant', 'Analisei o edital e atualizei sua inscrição.');
select tests.throws(
  $$insert into core.assistant_messages (org_id, conversation_id, role, content, author_id) values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'user', 'falsificada', '00000000-0000-0000-0000-00000000000a')$$,
  'mensagem não pode ser assinada em nome de outra pessoa');
select tests.throws(
  $$update core.assistant_messages set content = 'editada'$$,
  'mensagens da conversa não são editáveis');

insert into core.agent_actions (id, org_id, run_id, workspace_id, tool, kind, status, input, before_data, after_data,
                                target_table, target_id, evidence, confidence)
values ('72000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000a1',
        '40000000-0000-0000-0000-0000000000a1', 'atualizar_item', 'write', 'ok', '{"status":"done"}', '{"status":"pending"}',
        '{"status":"done"}', 'edital_workspace_items', '60000000-0000-0000-0000-0000000000a1',
        '{"documento":"Regulamento","pagina":3,"trecho":"certidão negativa"}', 'confirmed');
insert into core.agent_actions (id, org_id, run_id, workspace_id, tool, kind, status, proposal)
values ('72000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000a1',
        '40000000-0000-0000-0000-0000000000a1', 'solicitar_confirmacao', 'proposal', 'pending_confirmation',
        '{"acao":"marcar_enviada"}');
select tests.throws(
  $$update core.agent_actions set summary = 'reescrita' where id = '72000000-0000-0000-0000-0000000000a1'$$,
  'auditoria das ações é imutável (só a decisão muda)');
select tests.throws(
  $$update core.agent_actions set status = 'approved' where id = '72000000-0000-0000-0000-0000000000a1'$$,
  'só propostas pendentes podem ser aprovadas');
select tests.ok(
  tests.affected($$update core.agent_actions set status = 'approved' where id = '72000000-0000-0000-0000-0000000000a2'$$) = 1,
  'Diretoria aprova a proposta');
select tests.ok(
  (select decided_by = '00000000-0000-0000-0000-00000000000e' and decided_at is not null from core.agent_actions
   where id = '72000000-0000-0000-0000-0000000000a2'),
  'o banco registra quem decidiu e quando');
select tests.throws(
  $$insert into core.agent_actions (org_id, run_id, workspace_id, tool, kind, status) values ('10000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a2', 'x', 'write', 'ok')$$,
  'ação não pode apontar para área de trabalho diferente da execução');

insert into core.workspace_findings (id, org_id, workspace_id, kind, dedupe_key, title, confidence, source_kind, evidence, item_id, run_id)
values ('73000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1',
        'inconsistency', 'orcamento-teto', 'Orçamento acima do teto', 'confirmed', 'edital',
        '{"documento":"Regulamento","pagina":7,"trecho":"até R$ 1.000.000,00"}', '60000000-0000-0000-0000-0000000000a1',
        '71000000-0000-0000-0000-0000000000a1');
select tests.throws(
  $$insert into core.workspace_findings (org_id, workspace_id, kind, dedupe_key, title) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'inconsistency', 'orcamento-teto', 'Duplicado')$$,
  'achado não duplica (área + tipo + chave)');
select tests.throws(
  $$insert into core.workspace_findings (org_id, workspace_id, kind, dedupe_key, title, item_id) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'risk', 'x', 'Item de outro edital', '60000000-0000-0000-0000-0000000000a2')$$,
  'achado não aponta item de outra área de trabalho');
select tests.ok(
  tests.affected($$update core.workspace_findings set status = 'resolved', resolution = 'Corrigido' where id = '73000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Diretoria resolve o achado');
select tests.ok(
  (select resolved_by = '00000000-0000-0000-0000-00000000000e' and resolved_at is not null from core.workspace_findings
   where id = '73000000-0000-0000-0000-0000000000a1'),
  'o banco registra quem resolveu');
select tests.ok(
  tests.affected($$delete from core.workspace_findings where id = '73000000-0000-0000-0000-0000000000a1'$$) = 0,
  'Diretoria não exclui achados (só ADM)');

insert into core.edital_texts (org_id, edital_id, source, label, pages, page_count, char_count)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'fields', 'Cadastro do edital',
        '["Página única"]', 1, 12);
select tests.throws(
  $$insert into core.edital_texts (org_id, edital_id, source, label) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1', 'fields', 'x')$$,
  'texto de edital de outra organização não é gravado');

update core.edital_workspace_items
set confidence = 'confirmed', source_kind = 'edital', evidence_document = 'Regulamento', evidence_page = 3,
    updated_via = 'assistant', ai_suggestion = 'Sugestão'
where id = '60000000-0000-0000-0000-0000000000a1';
select tests.ok(
  (select updated_via = 'assistant' and evidence_page = 3 from core.edital_workspace_items where id = '60000000-0000-0000-0000-0000000000a1'),
  'item registra evidência, confiança e que foi alterado pelo assistente');

select tests.throws(
  $$insert into core.ai_usage (org_id, purpose, provider, model, status) values ('10000000-0000-0000-0000-00000000000a', 'assistente.passo', 'anthropic', 'claude-opus-5-5', 'success')$$,
  'custo por chamada continua sendo gravado só pelo servidor (não forjável pela sessão)');
select tests.ok(
  tests.affected($$update core.agent_runs set input_tokens = 100, output_tokens = 20, cost_usd = 0.0008 where id = '71000000-0000-0000-0000-0000000000a1'$$) = 1,
  'totais de tokens e custo ficam na execução');

-- Equipe vê, mas não altera -----------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 2 from core.assistant_messages), 'Equipe lê a conversa');
select tests.ok((select count(*) = 1 from core.agent_runs), 'Equipe vê as execuções');
select tests.ok(
  tests.affected($$update core.agent_actions set status = 'declined' where status = 'pending_confirmation'$$) = 0,
  'Equipe não decide propostas');
select tests.throws(
  $$insert into core.assistant_messages (org_id, conversation_id, role, content) values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'user', 'oi')$$,
  'Equipe não escreve na conversa do agente');

-- Outra organização: isolamento completo -----------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.assistant_conversations), 'outra organização não vê a conversa');
select tests.ok((select count(*) = 0 from core.assistant_messages), 'outra organização não vê as mensagens');
select tests.ok((select count(*) = 0 from core.agent_runs), 'outra organização não vê as execuções');
select tests.ok((select count(*) = 0 from core.agent_actions), 'outra organização não vê a auditoria');
select tests.ok((select count(*) = 0 from core.workspace_findings), 'outra organização não vê os achados');
select tests.ok((select count(*) = 0 from core.edital_texts), 'outra organização não vê o texto do edital');
select tests.throws(
  $$insert into core.agent_runs (org_id, conversation_id, workspace_id, request) values ('10000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', 'x')$$,
  'não cria execução na conversa de outra organização');

-- ADM: exclui achado ---------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$delete from core.workspace_findings where id = '73000000-0000-0000-0000-0000000000a1'$$) = 1,
  'ADM exclui achado');

reset role;
select tests.ok(
  (select count(*) >= 2 from core.audit_log where table_name = 'workspace_findings'),
  'achados ficam na auditoria');

\echo 'Todos os testes do Assistente LEP passaram.'

rollback;
