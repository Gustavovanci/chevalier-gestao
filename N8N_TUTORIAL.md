# Como configurar o N8N + Evolution API (Passo a Passo Definitivo)

Como o primeiro teste não funcionou na sua máquina, vamos simplificar o processo ao máximo. O **N8N** permite importar fluxos prontos copiando e colando código. Preparei o fluxo inteiro pra você!

## PASSO 1: Copiar o Fluxo Pronto
Abaixo está o código do Fluxo (Workflow) completo que conecta seu app à Evolution API. 

1. Copie **TODO o código de texto abaixo**:

```json
{
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "novo-vale",
        "options": {}
      },
      "id": "e7c4f107-1678-43d9-ab7a-42c238b16c87",
      "name": "App Chevalier",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [
        460,
        300
      ],
      "webhookId": "novo-vale"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "SUA_URL_DA_EVOLUTION_API_AQUI/message/sendText/NOME_DA_SUA_INSTANCIA",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "apikey",
              "value": "SUA_API_KEY_DA_EVOLUTION_AQUI"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "number",
              "value": "={{ $json.body.celular }}"
            },
            {
              "name": "text",
              "value": "={{ \"Olá \" + $json.body.funcionario + \", foi registrado no sistema um novo *\" + $json.body.tipo + \"* no valor de R$ *\" + $json.body.valor.toFixed(2).replace('.', ',') + \"*.\\n\\nAtt, \" + $json.body.empresa }}"
            }
          ]
        },
        "options": {}
      },
      "id": "f5a04e9c-bd5a-4bfc-a2b1-6b2c244c03b1",
      "name": "Evolution API",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [
        680,
        300
      ]
    }
  ],
  "connections": {
    "App Chevalier": {
      "main": [
        [
          {
            "node": "Evolution API",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## PASSO 2: Colar e Configurar no N8N
1. Vá no seu N8N (`http://localhost:5678`).
2. Clique em **`Add Workflow`**.
3. Clique em qualquer lugar em branco na tela quadriculada do Canvas e aperte **Ctrl+V** (ou *Cmd+V* no Mac) para colar o fluxo. 
4. Vão aparecer *dois nós* ligados automaticamente: "App Chevalier" e "Evolution API".

### Configurar Nó 2 (Evolution API)
Dê um clique duplo no nó **Evolution API**. Preencha 3 coisas fundamentais dependentes da **sua conta/instalação da Evolution API**:
1. No campo verde **`URL`**: Troque a palavra `SUA_URL.../NOME_DA_SUA_INSTANCIA` pela rota real do seu servidor disparador (exemplo: `http://localhost:8080/message/sendText/instancia-gusta`).
2. Nos **`Headers`**: Tem uma chave chamada `apikey` (padrão da Evolution). No campo de value, cole o global ApiKey do seu servidor da Evolution API.
3. Feche a caixa do nó (Back to canvas).

## PASSO 3: O Teste Dourado!
1. Dê um duplo clique no primeiro nó (o que tem o ícone de engrenagem, chamado "App Chevalier").
2. Clique no botão de URL dele e selecione **`Test URL`**. Ele deve mostrar: `http://localhost:5678/webhook-test/novo-vale`. 
   > *(⚠️ Importante: O nosso painel 'app.js' está apontando para `http://localhost:5678/webhook/novo-vale` sem o `-test`. Para testar a primeira vez, precisaremos atulizar o app.js rapidadamente se quisermos simular, ou testar abrindo o postman).*
   > *Na verdade, vamos tornar isso mais fácil!*
3. Simplesmente ative seu fluxo virando a **chavinha de Inactive para Active** no canto superior direito do n8n. **Feito isso, não precisamos mais focar na URL de teste**.
4. Abra o seu painel financeiro no `index.html`. 
5. Crie um vale e clique em confirmar. (Use o seu próprio número de celular).

**Se der algum erro no N8N e não mandar**, você verá a aba central de "Executions" ou de testes vermelhinha constando erro de Auth da Evolution ou URL errada. Verifique os painéis do seu gerenciador.
