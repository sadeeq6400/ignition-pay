import 'package:stellar/stellar.dart';

void main() async {
  final keypair = Keypair.random();
  print('Public Key: \');
  print('Secret Seed: \');

  final server = Server('https://horizon-testnet.stellar.org');
  await FriendBot.fundTestAccount(keypair.accountId);
  print('Account funded on testnet');

  final account = await server.accounts.account(keypair.accountId);
  for (final balance in account.balances) {
    print('Balance: \ \');
  }

  final destination = 'GBSH7WNSDU5K3J2I5H3K2M6QZQKJ3PZ7PJ3VJ6QZQKJ3PZ7PJ3VJ6';
  final transaction = TransactionBuilder(account)
    .addOperation(PaymentOperation(
      destination: destination,
      asset: AssetTypeNative(),
      amount: '10.0',
    ))
    .build();

  transaction.sign(keypair);
  final response = await server.submitTransaction(transaction);
  print('Transaction hash: \');
}