# Bio Dados Amazônia

> **Projeto piloto.** Protótipo de um projeto científico próprio. As imagens definitivas serão coletadas com autorização; os espaços de imagem atuais são provisórios.

Banco de dados digital interativo para integrar, organizar, armazenar e consultar informações científicas sobre **animais peçonhentos** e **plantas medicinais** da Amazônia, com foco no estado de **Roraima**. O objetivo é subsidiar pesquisas, fortalecer a gestão do conhecimento e apoiar a produção científica.

## O que o site oferece

- Mapa interativo dos 15 municípios de Roraima, com seleção por clique ou por lista.
- Painel territorial com código IBGE, área, população e densidade demográfica.
- Card flutuante por espécie, com expansão para a página de detalhe.
- Abas: Animais peçonhentos, Plantas medicinais, Usos, Conexão e Autoria.
- Interface responsiva, com navegação por teclado e respeito à preferência de movimento reduzido.

## Como usar

O site é um único arquivo estático.

1. Abra `index.html` no navegador, com conexão à internet (mapa e fontes são carregados online).
2. Para publicar, use o GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.
3. Para trocar a logo, coloque um arquivo `logo.png` na mesma pasta de `index.html`.

## Fontes de dados

| Dado | Fonte |
|---|---|
| Limites municipais | IBGE, API de Malhas v3 (UF 14) |
| Área e população | IBGE, Censo 2022 (SIDRA, tabela 4714) |
| Ocorrências das espécies | GBIF (valores nacionais, não municipais) |
| Moléculas, classes e atividades | Base própria do projeto (CSV) e referências citadas em cada espécie |
| Imagem de satélite | Sentinel-2 cloudless © EOX, contém dados Copernicus Sentinel 2020, CC BY-NC-SA 4.0 |

## Limitações e critérios

- A base atual **não contém município nem coordenadas**. Nenhuma espécie é atribuída a município por inferência; registros sem localização municipal são tratados como "localização municipal desconhecida".
- As barras de ocorrência mostram contagens do GBIF no Brasil, e não registros municipais.
- Dados inexistentes aparecem como "Dado não disponível". Nada é estimado ou preenchido artificialmente.
- O nível de evidência (A, B, C) ainda não está classificado na base; o grau atual é "Ø · não classificado".
  - **A:** literatura revisada por pares, com evidência robusta.
  - **B:** indicado na literatura, com evidência preliminar.
  - **C:** conhecimento popular ou tradicional.
- Uma maior quantidade de registros pode refletir maior esforço de coleta, e não maior abundância biológica.
- O satélite da EOX é de **uso não comercial**.

## Aviso

Conteúdo informativo e científico. Não substitui orientação médica. O uso tradicional não equivale a eficácia comprovada.

## Autoria

Equipe, instituição e forma de citação: a preencher.
