# Bio Dados Amazônia

> **Projeto piloto.** Os dados atuais são fictícios e servem apenas para teste. As imagens definitivas serão coletadas com autorização.

Banco de dados digital para integrar, organizar e consultar informações científicas sobre **animais peçonhentos**, **plantas medicinais** e **fungos** de **Roraima**: cada espécie ligada às moléculas, classes químicas e atividades biológicas descritas na literatura.

## Estrutura

```
index.html          página, estilos e uma cópia embutida dos dados (reserva)
app.js              lógica do site; no topo ficam os endereços das tabelas
dados/
  especies.csv      uma linha por espécie
  moleculas.csv     uma linha por molécula com ficha própria (opcional)
  registros.csv     uma linha por evidência: espécie + molécula + atividade + fonte
imagens/            fotos e figuras (sempre com crédito e licença)
```

## O que o site oferece

- Ficha por espécie no formato de etiqueta de coleção, com taxonomia, descrição, todos os compostos registrados, grau de evidência, referência com DOI e links para PDB, UniProt e PubChem.
- Distribuição em Roraima: municípios com registro na base e ocorrências do GBIF consultadas em tempo real, filtradas pelos limites do IBGE e contadas por município.
- Estrutura 3D da molécula em destaque (quando houver código PDB).
- Diagrama de conexão espécie → molécula → classe → atividade, com destaque dos caminhos.
- Busca única por espécie, nome popular, molécula, classe ou atividade.
- Mapa dos 15 municípios com dados do Censo 2022.
- Citação ABNT pronta por ficha e exportação dos registros em CSV.
- Página **Contribuir** com guia, dicionário de dados e lista automática de pendências (sem DOI, sem grau, sem foto etc.).
- Modo claro e escuro, navegação por teclado, respeito a movimento reduzido.

## Como alimentar a base

1. Edite as três tabelas da pasta `dados` (ou uma planilha Google com três abas de mesmo nome).
2. Um registro por evidência: três moléculas da mesma espécie são três linhas em `registros.csv`.
3. Valide o nome científico (Reflora para plantas e fungos, Reptile Database para serpentes) e atribua o grau A, B ou C.
4. Publique:
   - **Arquivos:** substitua os CSV da pasta `dados` no GitHub. O site lê os novos dados automaticamente.
   - **Planilha Google:** Arquivo → Compartilhar → Publicar na Web, publique cada aba como CSV e cole os três links em `FONTES`, no início do `app.js`.

O Excel em português salva CSV com ponto e vírgula; o site aceita os dois formatos. Salve sempre em UTF-8.

O dicionário completo de colunas está na página **Contribuir** do site.

## Publicação

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

Ao abrir o `index.html` direto do computador, o navegador bloqueia a leitura dos CSV e o site usa a cópia embutida. Para testar localmente com os CSV, rode `python3 -m http.server` na pasta e abra `http://localhost:8000`.

## Graus de evidência

- **A:** literatura revisada por pares, evidência robusta.
- **B:** indicado na literatura, evidência preliminar.
- **C:** conhecimento popular ou tradicional.

## Fontes de dados

| Dado | Fonte |
|---|---|
| Limites municipais | IBGE, API de Malhas v3 (UF 14) |
| Área e população | IBGE, Censo 2022 (SIDRA, tabela 4714) |
| Ocorrências | GBIF.org, consulta em tempo real |
| Estruturas 3D | RCSB Protein Data Bank |
| Moléculas, classes e atividades | Base própria do projeto, com a referência de cada registro |
| Imagem de satélite | Sentinel-2 cloudless © EOX, dados Copernicus Sentinel 2020, CC BY-NC-SA 4.0 (uso não comercial) |

## Limitações

- Nenhuma espécie é atribuída a município por inferência. A base só mostra município quando o registro informa `municipio_ibge`.
- Ocorrências do GBIF são exibidas à parte e identificadas como tal.
- Mais registros podem refletir maior esforço de coleta, não maior abundância.
- Dados ligados a conhecimento tradicional podem exigir cadastro no SisGen (Lei 13.123/2015) antes da publicação.

## Aviso

Conteúdo informativo e científico. Não substitui orientação médica. O uso tradicional não equivale a eficácia comprovada.

## Autoria

Equipe, instituição, licença e forma de citação: a preencher.
