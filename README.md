# WASTELAND TERMINAL

Um sistema de log de sessão para RPG de mesa inspirado nos terminais do **Fallout Pip-Boy**. O mestre roda o aplicativo no seu PC e os jogadores conectam pelo Wi-Fi local via navegador.

## Funcionalidades

- **Terminal individual por jogador** — cada jogador vê apenas as mensagens que lhe são direcionadas + transmissões para todos
- **Visual retrô Fallout** — fundo preto, texto verde monospace, efeito de scanlines CRT, animação de digitação character-by-character
- **Dashboard do mestre** — painel de controle para enviar mensagens privadas, transmissões globais e usar presetes de mensagens
- **Presetes de mensagens** — templates prontos para combate, viagem, encontros e condições com seleção de jogadores e criaturas do Fallout
- **Exportação de logs** — download do transcript combinado ou individual por jogador em `.txt`, ou tudo junto em `.zip`
- **Proteção por PIN** — PIN opcional para acessar o dashboard do mestre
- **Backup automático** — banco de dados copiado na inicialização do servidor

## Como usar

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. O servidor imprime o IP local no console. Abra o dashboard do mestre em:
   ```
   http://<seu-ip>:3000/dm
   ```

4. Adicione jogadores no dashboard e compartilhe os links de acesso.

5. Para definir um PIN do mestre, edite `config/config.js`:
   ```javascript
   DM_PIN: "1234"
   ```

## Estrutura do projeto

```
/server
  server.js          # Servidor Express + Socket.IO
  db.js              # SQLite + queries
  sockets.js         # Eventos Socket.IO
  routes/
    players.js       # CRUD de jogadores
    messages.js      # Envio de mensagens
    auth.js          # Autenticação do mestre
    session.js       # Reset de sessão
    export.js        # Exportação de transcripts
/config
  config.js          # Configurações (PIN, porta, etc)
/public
  /player            # Terminal do jogador
  /dm                # Dashboard do mestre
  favicon.svg        # Ícone do terminal
/data
  session.sqlite     # Banco de dados
  /backup            # Backups automáticos
```

## Tecnologias

- **Backend:** Node.js + Express
- **Tempo real:** Socket.IO
- **Banco de dados:** SQLite (better-sqlite3)
- **Frontend:** HTML/CSS/JS puro
- **Ícones:** Font Awesome

## Licença

ISC
