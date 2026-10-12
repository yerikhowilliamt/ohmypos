import { HttpStatus } from '@nestjs/common';
import { PostgresTriggerExceptionFilter } from './postgres-trigger-exception.filter';

/** Regression test for ERR-046: an oversized body returned 500 instead of 413. */
describe('PostgresTriggerExceptionFilter', () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        id: 'corr-1',
        method: 'POST',
        url: '/api/v1/sales',
      }),
    }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('menjawab 413 untuk body yang melewati batas ukuran', () => {
    const filter = new PostgresTriggerExceptionFilter();
    // Bentuk yang benar-benar dilempar body-parser.
    const err = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });

    filter.catch(err, host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.PAYLOAD_TOO_LARGE }),
    );
  });

  it('tetap menjawab 500 untuk error yang benar-benar tidak terduga', () => {
    const filter = new PostgresTriggerExceptionFilter();

    filter.catch(new Error('boom'), host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
