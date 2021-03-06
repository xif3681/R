import _ from 'lodash';
import 'ui/directives/truncated';
import 'ui/directives/infinite_scroll';
import html from 'ui/ar_doc_table/ar_doc_table.html';
import getSort from 'ui/ar_doc_table/lib/get_sort';
import 'ui/ar_doc_table/components/ar_table_header';
import 'ui/ar_doc_table/components/ar_table_row';
import 'ui/ar_doc_table/ar_doc_table.less';
import uiModules from 'ui/modules';



uiModules.get('kibana')
.directive('arDocTable', function (config, Notifier, getAppState) {
  return {
    restrict: 'E',
    template: html,
    scope: {
      sorting: '=',
      columns: '=',
      hits: '=?', // You really want either hits & indexPattern, OR searchSource
      indexPattern: '=?',
      searchSource: '=?',
      infiniteScroll: '=?',
      filter: '=?',
    },
    link: function ($scope) {
      let notify = new Notifier();
      $scope.limit = 50;
      $scope.persist = {
        sorting: $scope.sorting,
        columns: $scope.columns
      };

      let prereq = (function () {
        let fns = [];

        return function register(fn) {
          fns.push(fn);

          return function () {
            fn.apply(this, arguments);

            if (fns.length) {
              _.pull(fns, fn);
              if (!fns.length) {
                $scope.$root.$broadcast('ready:vis');
              }
            }
          };
        };
      }());




      $scope.indexPattern = $scope.indexPattern ? $scope.indexPattern : {};

      $scope.indexPattern.formatField = function (hit, fieldName) {
        let partials = hit.$$_partialFormatted;
        if (partials && partials[fieldName] != null) {
          return partials[fieldName];
        }

        if (!partials) {
          partials = hit.$$_partialFormatted = {};
        }

        let val = fieldName === '_source' ? hit._source : hit._source[fieldName];

        return partials[fieldName] = val;
      };

      $scope.addRows = function () {
        $scope.limit += 50;
      };

      // This exists to fix the problem of an empty initial column list not playing nice with watchCollection.
      $scope.$watch('columns', function (columns) {
        if (columns.length !== 0) return;

        let $state = getAppState();
        $scope.columns.push('_source');
        if ($state) $state.replace();
      });

      $scope.$watchCollection('columns', function (columns, oldColumns) {
        if (oldColumns.length === 1 && oldColumns[0] === '_source' && $scope.columns.length > 1) {
          _.pull($scope.columns, '_source');
        }

        if ($scope.columns.length === 0) $scope.columns.push('_source');
      });


      $scope.$watch('searchSource', prereq(function (searchSource) {
        if (!$scope.searchSource) return;

        $scope.indexPattern = $scope.searchSource.get('index');

        $scope.searchSource.size(config.get('discover:sampleSize'));
        $scope.searchSource.sort(getSort($scope.sorting, $scope.indexPattern));

        // Set the watcher after initialization
        $scope.$watchCollection('sorting', function (newSort, oldSort) {
          // Don't react if sort values didn't really change
          if (newSort === oldSort) return;
          $scope.searchSource.sort(getSort(newSort, $scope.indexPattern));
          $scope.searchSource.fetchQueued();
        });

        $scope.$on('$destroy', function () {
          if ($scope.searchSource) $scope.searchSource.destroy();
        });

        // TODO: we need to have some way to clean up result requests
        $scope.searchSource.onResults().then(function onResults(resp) {
          // Reset infinite scroll limit
          $scope.limit = 50;

          // Abort if something changed
          if ($scope.searchSource !== $scope.searchSource) return;

          $scope.hits = resp.hits.hits;

          return $scope.searchSource.onResults().then(onResults);
        }).catch(notify.fatal);

        $scope.searchSource.onError(notify.error).catch(notify.fatal);
      }));

    }
  };
});
