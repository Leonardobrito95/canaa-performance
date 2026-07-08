# Termo de Aceite e Plano de Implantacao: Canaa Performance

Este documento estabelece as diretrizes oficias, os prazos de operacao controlada e os termos de ciencia exigidos para a adocao definitiva da plataforma Canaa Performance como unico instrumento de validacao, registro e apuracao financeira de comissionamento da equipe BDR e bonificacao de Retencao (CS).

---

## 1. POC de Teste e Cronograma de Implantacao

Para garantir a confiabilidade integral e a adaptacao da equipe operativa, a transicao sera suportada por uma Prova de Conceito (POC). 

* **Prazo de Testes (Operacao Assistida):** O sistema ficara em periodo experimental por 15 dias corridos apos a apresentacao oficial para a lideranca. Durante essa janela, o Canaa Performance funcionara em paralelo aos mapeamentos legados (planilhas), a fim de auditar se os calculos retornam as mesmas metricas, e as gestoes poderao sanar duvidas a respeito da usabilidade.
* **Implantacao Definitiva:** Encerrados os 15 dias de testes, as ferramentas retroativas de envio de relatorios manuais comerciais serao totalmente desativadas e o sistema tornara-se obrigatorio.
* **Indicadores de Sucesso da Implementacao:**
  1. Processamento e divergencia zero frente aos relatorios validados pre-homologados no legado da folha de pagamento.
  2. Reducao de pleitos manuais por parte dos consultores BDR na ordem de 95% apos a introducao.
  3. Adocao e lancamento padronizado em SLA operacional sem quebras (100% de registros operados direto no portal pelos usuarios).

## 2. Regras Utilizadas de Validacao 

A fim de promover controle de dados robustos atrelados ao IXC, a liberacao de valores no momento do calculo (Snapshot de pagina central) impoe a observancia e correspondencia matematica dos padroes a seguir:

* **Validador de Status Cadastral:** Para inclusao no painel financeiro final do snapshot, e imprenscindivel que a classificacao original do contrato IXC permaneca no status categorizado como 'AT' (Ativo) na data do trancamento. Contratos bloqueados reduzem os honorarios vinculados.
* **Validador de Retorno Financeiro:** A ferramenta veta tecnicamente operacoes de modalidade 'Upgrade' onde os colaboradores declarem valor final menor ou correspondente ao inicial em database. Upgrades demandam lucro superior obrigatorio em banco.
* **Validador Exato de Formato Assinatorio (GovSign / ZapSign):** Para desvincular a analise humana dos anexos contratuais, a maquina le rigidamente cadeias fixas.
  * *Assinantes ZapSign* dependem irrestritamente da composicao e do padrao prefixo (ID DO CONTRATO seguido de hifen textualmente claro para interpretacao). 
  * *Assinantes GovSign* exigem obrigatoriamente nomenclaturas nominais (ID DO CONTRATO anexado do logogrifo e sigla unificadora GOV). 
* **Ausencia de Inadimplencia no Periodo:** Checagem restrita de debitos da contratacao no espaco cronologico do processamento original antes da migracao da folha.

## 3. Penalizacao do Nao Uso e Recorrencia ao Legado
A plataforma "Canaa Performance" e declaradamente concebida e parametrizada como padrao e motor unico empresarial, sendo invariavel aos seus perfis de acesso sob as seguintes clausulas estritas:
* O colaborador ou linha de gestao que optar pela submissao de arquivos baseados em planilhas informais apos o termino oficial da duracao da POC nao obtera retificacao pela equipe de fechamento. 
* Concessoes por Upgrade ausentes de registro no sistema dentro da margem cronologica cabivel ao ciclo de apuracao, serao interpretadas administrativamente como faltantes, perdendo cobertura do pagamento e reativacao retroativa fora do mes correspondente de apuracao de folha. 
* Documentos de arquivos digitais que operarem falha em conformidades com os termos da regiao "2.", dependentes da despadronizacao de anexos originada pela neglicencia do integrador humano, permanecerao represados em bloqueio ate solucao nativa - recaindo perca por negligencia ate ser reaberto devidamente sob acerto local.

---