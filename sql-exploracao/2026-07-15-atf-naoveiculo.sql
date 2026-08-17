-- =====================================================================
-- BENS NÃO-VEÍCULO por classe (ATFITEM) — Globus, empresa 4.
-- ATFITEM.CONTA (texto) não serve; mas CONTACTBCMD/CDD/DPD são CODCONTACTB reais.
-- (C1) descobre qual aponta pro imobilizado (1.3.02.*); (C2) conta por classe.
-- Filtra CODIGOVEIC IS NULL (veículo vem do FRT, não duplicar).
-- =====================================================================


-- (C1) SONDAGEM — pra 10 bens não-veículo, qual conta cai em 1.3.02.* (imobilizado)?
--      A coluna cujo classificador começa com 1.3.02.01/02 é a que vou usar no C2.
SELECT ATF.CODIGO,
       SUBSTR(ATF.DESCRICAO, 1, 45) AS descricao,
       (SELECT MIN(C.CLASSIFICADOR) FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTACTBCMD) AS via_cmd,
       (SELECT MIN(C.CLASSIFICADOR) FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTACTBCDD) AS via_cdd,
       (SELECT MIN(C.CLASSIFICADOR) FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTACTBDPD) AS via_dpd
  FROM ATFITEM ATF
 WHERE ATF.CODIGOEMPRESA = 4
   AND ATF.DATABAIXA IS NULL
   AND ATF.CODIGOVEIC IS NULL
   AND ROWNUM <= 10;


-- (C2) CONTAGEM por classe (não-veículo), via CONTACTBCMD (troco a coluna se o C1
--      indicar CDD/DPD). O classificador casa com as classes da tela.
SELECT classificador,
       COUNT(*)                    AS qtd_bens,
       ROUND(SUM(aquisvalor), 2)   AS vlr_aquisicao
  FROM (
        SELECT ATF.CODIGO,
               ATF.AQUISVALOR AS aquisvalor,
               (SELECT MIN(C.CLASSIFICADOR) FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTACTBCMD) AS classificador
          FROM ATFITEM ATF
         WHERE ATF.CODIGOEMPRESA = 4
           AND ATF.DATABAIXA IS NULL
           AND ATF.CODIGOVEIC IS NULL
       )
 GROUP BY classificador
 ORDER BY vlr_aquisicao DESC;
