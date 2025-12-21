import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['.wxt/**', '.output/**', 'src/types/openapi.d.ts'],
  tsx: true,
  vue: true,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  rules: {
    'ts/method-signature-style': 'off',
    'ts/no-redeclare': 'off',
    'no-console': 'off',
    'eslint-comments/no-unlimited-disable': 'off',
    'vue/no-v-text-v-html-on-component': 'off',
    'no-alert': 'off',
    'style/indent-binary-ops': 'off',
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-member-access': 'off',
    'ts/no-unsafe-return': 'off',
    'ts/strict-boolean-expressions': 'off',
    'vue/component-definition-name-casing': ['error', 'PascalCase'],
  },
})
